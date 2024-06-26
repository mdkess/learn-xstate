"use client";
import {
  type ActorRefFrom,
  assign,
  sendTo,
  setup,
  type Snapshot,
  type SnapshotFrom,
  fromPromise,
} from "xstate";
import classes from "./index.module.css";
import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

type LockContext = {
  password: string;
  error: string;
};

// BUG: The door can be locked but still able to be opened.
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
        return event.password;
      },
    }),
    clearPassword: assign({
      password: "",
    }),
    clearError: assign({
      error: "",
    }),
  },
  actors: {
    lock: fromPromise(async () => {
      await wait(1000);
      if (Math.random() > 0.5) {
        throw new Error("Couldn't lock (maybe the lock jammed)");
      }
    }),
    unlock: fromPromise(async () => {
      await wait(1000);
      if (Math.random() > 0.5) {
        throw new Error("Couldn't unlock (maybe the lock jammed)");
      }
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
      initial: "idle",
      onDone: {
        target: "locked",
        actions: ["clearError"],
      },
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
          invoke: {
            src: "lock",
            onDone: {
              target: "locked",
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) => {
                  // TODO: How to type check error?
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                  return (event.error as Error).message;
                },
              }),
            },
          },
        },
        locked: {
          // I'm not sure how to avoid this extra state - if I make locking final, the actor isn't invoked.
          type: "final",
        },
      },
    },
    locked: {
      onDone: {
        target: "unlocked",
        actions: ["clearPassword", "clearError"],
      },
      initial: "idle",
      states: {
        idle: {
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
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) => {
                  return (event.error as Error).message;
                },
              }),
            },
          },
        },
        unlocked: {
          type: "final",
        },
      },
    },
  },
});

const doorMachine = setup({
  types: {
    context: {} as {
      lockRef: ActorRefFrom<typeof lockMachine> | null;
      locked: boolean;
      error: string;
    },
    events: {} as
      | { type: "door.open" }
      | { type: "door.close" }
      | { type: "door.lock"; password: string }
      | { type: "door.unlock"; password: string }
      | {
          type: "xstate.snapshot.lock";
          snapshot: SnapshotFrom<typeof lockMachine>;
        }
      | {
          type: "xstate.snapshot.unlock";
          snapshot: SnapshotFrom<typeof lockMachine>;
        },
    children: {} as {
      lock: "lockMachine";
    },
  },
  actions: {
    clearError: assign({
      error: "",
    }),
  },
  actors: {
    lockMachine,
    openDoor: fromPromise(async () => {
      await wait(1000);
      if (Math.random() > 0.5) {
        throw new Error("Couldn't open the door (maybe it's stuck)");
      }
    }),
    closeDoor: fromPromise(async () => {
      await wait(1000);
      if (Math.random() > 0.5) {
        throw new Error("Couldn't close the door (maybe it's stuck)");
      }
    }),
  },
}).createMachine({
  initial: "closed",
  context: {
    lockRef: null,
    locked: false,
    error: "",
  },
  entry: assign({
    lockRef: ({ spawn }) =>
      spawn("lockMachine", { id: "lock", syncSnapshot: true }),
  }),
  on: {
    "xstate.snapshot.lock": {
      actions: assign({
        locked: ({ event }) => {
          return event.snapshot.value.locked !== undefined;
        },
        error: ({ event }) => {
          return event.snapshot.context.error;
        },
      }),
    },
  },
  states: {
    closed: {
      onDone: {
        target: "open",
        actions: ["clearError"],
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            "door.open": {
              target: "opening",
              guard: ({ context }) => {
                return !context.locked;
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
                  return {
                    type: "lock.unlock",
                    password: event.password,
                  };
                }
              ),
            },
          },
        },
        opening: {
          invoke: {
            src: "openDoor",
            onDone: {
              target: "opened",
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) => {
                  return (event.error as Error).message;
                },
              }),
            },
          },
        },
        opened: {
          type: "final",
        },
      },
    },
    open: {
      onDone: {
        target: "closed",
        actions: ["clearError"],
      },
      initial: "idle",
      states: {
        idle: {
          on: {
            "door.close": {
              target: "closing",
            },
          },
        },
        closing: {
          invoke: {
            src: "closeDoor",
            onDone: {
              target: "closed",
            },
            onError: {
              target: "idle",
              actions: assign({
                error: ({ event }) => {
                  return (event.error as Error).message;
                },
              }),
            },
          },
        },
        closed: {
          type: "final",
        },
      },
    },
  },
});

interface DoorMachineProps {
  snapshot: Snapshot<unknown> | null;
}

function DoorMachine({ snapshot }: DoorMachineProps) {
  const [state, send, machine] = useMachine(doorMachine, {
    snapshot: snapshot ?? undefined,
  });
  const getDoorClasses = (doorState: typeof state.value) => {
    if (doorState.open) {
      if (doorState.open === "closing") {
        return classes.door + " " + classes.open + " " + classes.closing;
      }
      return classes.door + " " + classes.open;
    }
    if (doorState.closed) {
      if (doorState.closed === "opening") {
        return classes.door + " " + classes.closed + " " + classes.opening;
      }
      return classes.door + " " + classes.closed;
    }
  };
  const lockState = state.context.lockRef?.getSnapshot().value;
  const getLockClasses = (state: typeof lockState) => {
    if (state?.locked) {
      if (state.locked == "idle") {
        return classes.locked + " " + classes.idle;
      } else if (state.locked === "unlocking") {
        return classes.locked + " " + classes.unlocking;
      }
      return classes.locked;
    }
    if (state?.unlocked) {
      if (state.unlocked == "idle") {
        return classes.unlocked + " " + classes.idle;
      } else if (state.unlocked === "locking") {
        return classes.unlocked + " " + classes.locking;
      }
      return classes.unlocked;
    }
    return "";
  };

  return (
    <div>
      <div className={classes.sceneContainer}>
        <div className={classes.scene}>
          <div className={getDoorClasses(state.value)}>
            <div className={classes.doorknob}></div>
            <div
              className={`${classes.keyhole} ${getLockClasses(lockState)}`}
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
      <div>{JSON.stringify(state.value)}</div>
      <div>
        Password is: {state.context.lockRef?.getSnapshot().context.password}
      </div>
      <div>
        Lock: {JSON.stringify(state.context.lockRef?.getSnapshot().value)}
      </div>
      <div
        style={{
          color: "red",
        }}
      >
        {state.context.error}
      </div>
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
