---
name: agentic-app
description: Build an interactive Agentic-App (output.html) that the user sees next to the chat and that can send prompts back into the conversation. Use when the user asks for a page, dashboard, form, report, or any visual/interactive result.
---

# Agentic-App

An Agentic-App is a single self-contained HTML file you write to `/app/output.html`. Bap collects it automatically (you do not need to mention it in your answer) and renders it beside the conversation in a sandboxed iframe. Buttons and forms inside the page can send a prompt back into the conversation — the prompt becomes a real user message, exactly as if the user had typed it.

## Rules for output.html

- Write exactly `/app/output.html` (case-sensitive basename `output.html`).
- One self-contained document: inline all CSS and JavaScript. No external files, no relative assets. Keep it under 2 MB.
- The iframe is sandboxed with `allow-scripts allow-forms` only: your script cannot make network calls to Bap, cannot read cookies, and cannot navigate the parent page. The ONLY channel back to Bap is the prompt protocol below.

## Sending a prompt back into the conversation

Post a message to the parent window:

```js
parent.postMessage(
  { type: "bap:agentic-app-prompt", version: 1, prompt: "Send the weekly email to the team" },
  "*",
);
```

- `prompt` must be a non-empty string. It is sent as a user message with the conversation's existing settings; you cannot attach files or change the model.
- Prompts only take effect as a direct result of real user interaction (a click or key press inside the page) while the app is shown in the live chat panel. Posts on page load, on a timer, or in a background loop are rejected, so always send from a real click or submit handler.
- The same page may also be shown in read-only views (for example a coworker's info page) where there is no prompt channel and no acknowledgement ever arrives. Always handle a never-arriving ack: re-enable the button after a short timeout instead of leaving it stuck in a "Sending…" state.
- Bap replies with an acknowledgement so you can show honest button state:

```js
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "bap:agentic-app-prompt-result") return;
  // data.status is "sent" or "rejected"
  // on rejection, data.reason may be "rate_limited", "no_user_activation", or "invalid"
});
```

- `sent` means the prompt is now a user message in the conversation (a new agent run starts, or it queues behind the current one). `rate_limited` means slow down — disable the button briefly. `no_user_activation` means the send did not come from a real user interaction.

## Complete example

```html
<!doctype html>
<html>
  <body>
    <button id="send">Send the weekly email</button>
    <script>
      const btn = document.getElementById("send");
      let ackTimer = null;
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "Sending…";
        parent.postMessage(
          { type: "bap:agentic-app-prompt", version: 1, prompt: "Send the weekly email" },
          "*",
        );
        // Recover if no ack arrives (e.g. rendered in a read-only view).
        ackTimer = setTimeout(() => {
          btn.textContent = "Try again";
          btn.disabled = false;
        }, 3000);
      });
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.type !== "bap:agentic-app-prompt-result") return;
        clearTimeout(ackTimer);
        if (data.status === "sent") {
          btn.textContent = "Sent ✓";
        } else {
          btn.textContent = "Try again";
          btn.disabled = false;
        }
      });
    </script>
  </body>
</html>
```

Build prompts dynamically from form values when useful (for example, interpolate a recipient and subject the user typed into the page), but always send them from a click or submit handler.
