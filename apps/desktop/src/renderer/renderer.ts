export {};

type AppState = "IDLE" | "CAPTURING" | "REVIEW";
type Settings = { stealthEnabled: boolean };

declare global {
  interface Window {
    ghostWriter: {
      getAppState: () => Promise<AppState>;
      dispatchEvent: (event: { type: string }) => Promise<AppState>;
      getSettings: () => Promise<Settings>;
      toggleStealth: () => Promise<Settings>;
    };
  }
}

const root = document.getElementById("root")!;

async function render() {
  const state = await window.ghostWriter.getAppState();
  const settings = await window.ghostWriter.getSettings();

  let controls = "";

  if (state === "IDLE") {
    const stealthStatus = settings.stealthEnabled ? "ON" : "OFF";
    controls = `
      <button id="start">Iniciar reunião</button>
      <hr>
      <div class="settings">
        <button id="toggle-stealth">Stealth Mode: ${stealthStatus}</button>
      </div>
    `;
  }

  if (state === "CAPTURING") {
    controls = `<button id="stop">Encerrar reunião</button>`;
  }

  if (state === "REVIEW") {
    controls = `
      <button id="save">Manter notas</button>
      <button id="discard">Excluir notas</button>
    `;
  }

  root.innerHTML = `
    <h1>GhostWriter</h1>
    <p>Status: ${state}</p>
    ${controls}
  `;

  wireEvents(state);
}

function wireEvents(state: AppState) {
  if (state === "IDLE") {
    document
      .getElementById("start")
      ?.addEventListener("click", async () => {
        await window.ghostWriter.dispatchEvent({
          type: "START_MEETING"
        });
        render();
      });

    document
      .getElementById("toggle-stealth")
      ?.addEventListener("click", async () => {
        await window.ghostWriter.toggleStealth();
        render();
      });
  }

  if (state === "CAPTURING") {
    document
      .getElementById("stop")
      ?.addEventListener("click", async () => {
        await window.ghostWriter.dispatchEvent({
          type: "STOP_MEETING"
        });
        render();
      });
  }

  if (state === "REVIEW") {
    document
      .getElementById("save")
      ?.addEventListener("click", async () => {
        await window.ghostWriter.dispatchEvent({
          type: "SAVE_NOTES"
        });
        render();
      });

    document
      .getElementById("discard")
      ?.addEventListener("click", async () => {
        await window.ghostWriter.dispatchEvent({
          type: "DISCARD_NOTES"
        });
        render();
      });
  }
}

render();