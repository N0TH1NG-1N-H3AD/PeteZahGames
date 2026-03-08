declare global {
  interface Window {
    scramjet: any;
    BareMux: any;
    __browserInitialized: boolean;
  }
}

export async function initBrowser() {
  if (window.__browserInitialized) return;
  window.__browserInitialized = true;

  await waitFor(() => typeof (window as any).$scramjetLoadController !== "undefined", 5000);

  const { ScramjetController } = (window as any).$scramjetLoadController();
  const scramjet = new ScramjetController({
    prefix: "/scramjet/",
    files: {
      wasm: "/scram/scramjet.wasm.wasm",
      all: "/scram/scramjet.all.js",
      sync: "/scram/scramjet.sync.js",
    },
  });

  scramjet.init();
  navigator.serviceWorker.register("./sw.js");
  window.scramjet = scramjet;

  await new Promise<void>((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    setTimeout(resolve, 3000);
  });

  console.log("[browser] Scramjet ready");

  await waitFor(() => typeof window.BareMux !== "undefined", 5000);

  const wispUrl =
    (window as any)._CONFIG?.wispurl ||
    (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";

  const bareUrl =
    (window as any)._CONFIG?.bareurl ||
    location.protocol + "//" + location.host + "/bare/";

  const connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");

  let attempts = 0;
  while (attempts < 10) {
    try {
      await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
      console.log("[browser] Transport: epoxy/wisp");
      break;
    } catch {
      try {
        await connection.setTransport("/baremux/index.mjs", [bareUrl]);
        console.log("[browser] Transport: bare");
        break;
      } catch {
        try {
          await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
          console.log("[browser] Transport: libcurl/wisp");
          break;
        } catch {
          attempts++;
          if (attempts >= 10) {
            console.error("[browser] Failed to set any transport after 10 attempts");
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    }
  }
}

function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (condition()) return resolve();
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
      }
    }, 50);
  });
}
