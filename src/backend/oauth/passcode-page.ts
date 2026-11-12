/**
 * @fileoverview The passcode screen shown during the MCP OAuth flow.
 *
 * Rendered by the Worker itself rather than by Astro, because it is served from
 * inside the OAuth provider's handler chain. It asks for "the access passcode"
 * and never names the binding the value is checked against.
 */

/** Escape a value for interpolation into HTML. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface PasscodePageOptions {
  /** Serialised OAuth request, round-tripped through a hidden field. */
  state: string;
  /** Name of the client asking for access, if it declared one. */
  clientName?: string;
  /** Message to show after a failed attempt. */
  error?: string;
}

/**
 * Build the passcode page.
 *
 * @param options - State to round-trip, client name, and any error to display
 */
export function renderPasscodePage(options: PasscodePageOptions): string {
  const { state, clientName, error } = options;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize access</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #09090b; color: #fafafa; padding: 1.5rem;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    width: 100%; max-width: 22rem; background: #18181b;
    border: 1px solid #27272a; border-radius: 12px; padding: 1.75rem;
  }
  h1 { margin: 0 0 .35rem; font-size: 1.15rem; }
  p  { margin: 0 0 1.25rem; color: #a1a1aa; font-size: .875rem; }
  label { display: block; margin-bottom: .4rem; font-size: .8rem; font-weight: 500; }
  input {
    width: 100%; padding: .6rem .7rem; border-radius: 8px;
    border: 1px solid #3f3f46; background: #09090b; color: #fafafa; font-size: .95rem;
  }
  input:focus { outline: 2px solid #6366f1; outline-offset: 1px; border-color: transparent; }
  button {
    width: 100%; margin-top: 1rem; padding: .6rem; border: 0; border-radius: 8px;
    background: #6366f1; color: #fff; font-size: .9rem; font-weight: 500; cursor: pointer;
  }
  button:hover { background: #4f46e5; }
  .error {
    margin-bottom: 1rem; padding: .6rem .7rem; border-radius: 8px; font-size: .8rem;
    background: #450a0a; border: 1px solid #7f1d1d; color: #fecaca;
  }
  .note { margin: 1rem 0 0; font-size: .75rem; color: #71717a; }
</style>
</head>
<body>
  <main class="card">
    <h1>Authorize access</h1>
    <p>${
      clientName
        ? `<strong>${escapeHtml(clientName)}</strong> is requesting access to your NotebookLM tasks.`
        : "An application is requesting access to your NotebookLM tasks."
    }</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/authorize">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <label for="passcode">Access passcode</label>
      <input id="passcode" name="passcode" type="password" autocomplete="current-password"
             autofocus required placeholder="Enter passcode">
      <button type="submit">Approve</button>
    </form>
    <p class="note">Access stays valid for one year.</p>
  </main>
</body>
</html>`;
}
