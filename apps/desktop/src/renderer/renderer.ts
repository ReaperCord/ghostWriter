export {};

declare global {
  interface Window {
    ghostWriter: {
      getAppState: () => Promise<string>;
    };
  }
}

const root = document.getElementById("root");

async function render() {
  if (!root) return;

  const state = await window.ghostWriter.getAppState();

  root.innerHTML = `
    <h1>GhostWriter</h1>
    <p>Status: ${state}</p>
  `;
}

render();