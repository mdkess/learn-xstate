"use client";
import {
  setup,
  assign,
  fromPromise,
  sendTo,
  sendParent,
  type Snapshot,
} from "xstate";
import classes from "./index.module.css";
import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LockContext = {
  password: string;
  error: string;
  userPassword: string;
};

const lockMachine = setup({
  types: {
    context: {} as LockContext,
    events: {} as { type: "lock.lock" | "lock.unlock"; password: string },
  },
  guards: {
    isCorrectPassword: ({ context, event }) => {
      return event.password === context.password;
    },
  },
  actors: {
    lock: fromPromise(async () => {
      await wait(1000);
      if (Math.random() < 0.2) {
        throw new Error("The lock is stuck.");
      }
    }),
    unlock: fromPromise(async () => {
      await wait(1000);
      if (Math.random() < 0.2) {
        throw new Error("The lock is stuck.");
      }
    }),
  },
}).createMachine({
  initial: "unlocked",
  context: {
    password: "",
    error: "",
    userPassword: "",
  },
  states: {
    locked: {
      on: {
        "lock.unlock": {
          target: "unlocking",
          guard: "isCorrectPassword",
        },
      },
    },
    unlocking: {
      invoke: {
        src: "unlock",
        onDone: {
          target: "unlocked",
          actions: [
            sendParent({ type: "lock.unlocked" }),
            assign({
              password: "",
              error: "",
            }),
          ],
        },
        onError: {
          target: "locked",
          actions: [
            sendParent(({ event }) => {
              return {
                type: "lock.error",
                error: (event.error as { message: string }).message,
              };
            }),
            assign({
              error: ({ event }) => {
                return (event.error as { message: string }).message;
              },
            }),
          ],
        },
      },
    },
    unlocked: {
      on: {
        "lock.lock": {
          target: "locking",
          actions: assign({
            userPassword: ({ event }) => {
              return event.password;
            },
          }),
        },
      },
    },
    locking: {
      invoke: {
        src: "lock",
        onDone: {
          target: "locked",
          actions: [
            sendParent({ type: "lock.locked" }),
            assign(({ context }) => {
              return {
                password: context.userPassword,
                userPassword: "",
                error: "",
              };
            }),
          ],
        },
        onError: {
          target: "unlocked",
          actions: [
            sendParent(({ event }) => {
              return {
                type: "lock.error",
                error: (event.error as { message: string }).message,
              };
            }),
            assign({
              error: ({ event }) => {
                return (event.error as { message: string }).message;
              },
            }),
          ],
        },
      },
    },
  },
});

type DoorContext = {
  locked: boolean;
  error: string;
};
const doorMachine = setup({
  types: {
    context: {} as DoorContext,
    events: {} as
      | { type: "door.open" }
      | { type: "door.close" }
      | { type: "door.lock"; password: string }
      | { type: "door.unlock"; password: string }
      | { type: "lock.unlocked" }
      | { type: "lock.locked" }
      | { type: "lock.error"; error: string },
  },
  actors: {
    lockManager: lockMachine,
    openDoor: fromPromise(async () => {
      await wait(1000);
      if (Math.random() < 0.2) {
        throw new Error("The door is stuck.");
      }
    }),
    closeDoor: fromPromise(async () => {
      await wait(1000);
      if (Math.random() < 0.2) {
        throw new Error("The door is stuck.");
      }
    }),
  },
  guards: {
    isLocked: ({ context }) => {
      return context.locked;
    },
    isUnlocked: ({ context }) => {
      return !context.locked;
    },
  },
}).createMachine({
  initial: "closed",
  context: {
    locked: false,
    error: "",
  },
  invoke: {
    id: "lockManager",
    src: "lockManager",
    onDone: {
      actions: (context, event) => {
        console.log("lockManager done", context, event);
      },
    },
  },
  states: {
    closed: {
      on: {
        "lock.unlocked": {
          actions: assign({
            locked: false,
          }),
        },
        "lock.locked": {
          actions: assign({
            locked: true,
          }),
        },
        "door.lock": {
          actions: sendTo("lockManager", ({ event }) => {
            return { type: "lock.lock", password: event.password };
          }),
        },
        "door.unlock": {
          actions: sendTo("lockManager", ({ event }) => {
            return { type: "lock.unlock", password: event.password };
          }),
        },
        "door.open": {
          target: "opening",
          guard: "isUnlocked",
        },
      },
    },
    opening: {
      invoke: {
        src: "openDoor",
        onDone: {
          target: "open",
          actions: assign({
            error: "",
          }),
        },
        onError: {
          target: "closed",
          actions: assign({
            error: ({ event }) => {
              return (event.error as { message: string }).message;
            },
          }),
        },
      },
    },
    open: {
      on: {
        "door.close": "closing",
      },
    },
    closing: {
      invoke: {
        src: "closeDoor",
        onDone: {
          target: "closed",
          actions: assign({
            error: "",
          }),
        },
        onError: {
          target: "open",
          actions: assign({
            error: ({ event }) => {
              return (event.error as { message: string }).message;
            },
          }),
        },
      },
    },
    "*": {
      on: {
        "lock.error": {
          actions: assign({
            error: ({ event }) => {
              return event.error;
            },
          }),
        },
      },
    },
  },
});

const getDoorClasses = (state: string) => {
  switch (state) {
    case "closed":
      return classes.door;
    case "opening":
      return classes.door + " " + classes.opening;
    case "open":
      return classes.door + " " + classes.open;
    case "closing":
      return classes.door + " " + classes.closing;
    default:
      return classes.door;
  }
};

interface DoorMachineProps {
  snapshot?: Snapshot<unknown>;
}
function DoorMachine({ snapshot }: DoorMachineProps) {
  const [state, send, machine] = useMachine(doorMachine, {
    snapshot: snapshot,
  });
  return (
    <div>
      <div className={classes.sceneContainer}>
        <div className={classes.scene}>
          <div className={getDoorClasses(state.value)}>
            <div className={classes.doorknob}></div>
            <div
              className={
                `${classes.keyhole}` +
                (state.context.locked
                  ? ` ${classes.locked}`
                  : "" + state.value === "unlocking"
                  ? ` ${classes.unlocking}`
                  : "")
              }
            ></div>
          </div>
        </div>
      </div>
      <div>
        <button onClick={() => send({ type: "door.open" })}>Open</button>
        <button onClick={() => send({ type: "door.close" })}>Close</button>
        <button onClick={() => send({ type: "door.lock", password: "1234" })}>
          Lock
        </button>
        <button onClick={() => send({ type: "door.unlock", password: "1234" })}>
          Unlock
        </button>
        <button onClick={() => send({ type: "door.unlock", password: "4321" })}>
          Unlock with wrong password
        </button>
      </div>
      <div>
        <button
          onClick={() => {
            const persistedState = machine.getPersistedSnapshot();
            localStorage.setItem("door", JSON.stringify(persistedState));
          }}
        >
          Save
        </button>
      </div>
      <div>{state.value}</div>
      <div>{JSON.stringify(state.context)}</div>
      <div style={{ color: "red" }}>{state.context.error}</div>
    </div>
  );
}

export default function Door() {
  const [snapshot, setSnapshot] = useState<
    Snapshot<unknown> | null | undefined
  >(undefined);

  useEffect(() => {
    const stored = localStorage.getItem("door");
    if (stored === null) {
      setSnapshot(null);
      return;
    }
    setSnapshot(JSON.parse(stored) as Snapshot<unknown>);
  }, []);

  if (snapshot === undefined) {
    return <div>Loading...</div>;
  }
  return <DoorMachine snapshot={snapshot} />;
}
