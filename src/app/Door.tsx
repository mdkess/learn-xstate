"use client";
import {
  type ActorRefFrom,
  assign,
  sendTo,
  setup,
  type Snapshot,
} from "xstate";
import classes from "./index.module.css";
import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";

type LockContext = {
  password: string;
  error: string;
};

const lockMachine = setup({
  types: {
    context: {} as LockContext,
    events: {} as
      | { type: "lock.lock"; password: string }
      | { type: "lock.unlock"; password: string },
  },
  actions: {
    assignPassword: assign({
      password: ({ event }) => {
        console.log("setting password", event.password);
        return event.password;
      },
    }),
    clearPassword: assign({
      password: "",
    }),
  },
  guards: {
    isCorrectPassword: ({ context, event }) =>
      context.password === event.password,
  },
}).createMachine({
  initial: "unlocked",
  context: {
    password: "",
    error: "",
  },
  states: {
    unlocked: {
      onDone: {
        target: "locked",
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            "lock.lock": {
              target: "locking",
              actions: ["assignPassword"],
            },
          },
        },
        locking: {
          type: "final",
        },
      },
    },
    locked: {
      onDone: {
        target: "unlocked",
        actions: ["clearPassword"],
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            "lock.unlock": {
              target: "unlocking",
              actions: ["clearPassword"],
              guard: "isCorrectPassword",
            },
          },
        },
        unlocking: {
          type: "final",
        },
      },
    },
  },
});

const doorMachine = setup({
  types: {
    context: {} as { lockRef: ActorRefFrom<typeof lockMachine> | null },
    events: {} as
      | { type: "door.open" }
      | { type: "door.close" }
      | { type: "door.lock"; password: string }
      | { type: "door.unlock"; password: string },
    children: {} as {
      lock: "lockMachine";
    },
  },
  actors: {
    lockMachine,
  },
}).createMachine({
  initial: "closed",
  context: {
    lockRef: null,
  },
  entry: assign({
    lockRef: ({ spawn }) =>
      spawn("lockMachine", { id: "lock", syncSnapshot: true }),
  }),
  states: {
    closed: {
      on: {
        "door.open": {
          target: "open",
          guard: ({ context }) => {
            if (context.lockRef === null) {
              return false;
            }
            return context.lockRef.getSnapshot().value.unlocked !== undefined;
          },
        },
        "door.lock": {
          actions: sendTo(
            ({ context }) => context.lockRef!,
            ({ event }) => {
              return {
                type: "lock.lock",
                password: event.password,
              };
            }
          ),
        },
        "door.unlock": {
          actions: sendTo(
            ({ context }) => context.lockRef!,
            ({ event }) => {
              console.log(event);
              return {
                type: "lock.unlock",
                password: event.password,
              };
            }
          ),
        },
      },
    },
    open: {
      on: {
        "door.close": "closed",
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
  snapshot: Snapshot<unknown> | null;
}
function DoorMachine({ snapshot }: DoorMachineProps) {
  const [state, send, machine] = useMachine(doorMachine, {
    snapshot: snapshot ?? undefined,
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
