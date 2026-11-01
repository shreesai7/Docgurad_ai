const form = document.querySelector("#auth-form");
const usernameField = document.querySelector("#username");
const passwordField = document.querySelector("#password");
const confirmField = document.querySelector("#confirm-password");
const confirmRow = document.querySelector("#confirm-row");
const errorBox = document.querySelector("#auth-error");
const submitButton = document.querySelector("#submit-button");
const signInTab = document.querySelector("#signin-tab");
const signUpTab = document.querySelector("#signup-tab");
const showPassword = document.querySelector("#show-password");
let mode = "login";

function friendlyApiError(body) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail) && body.detail.length) {
    const field = body.detail[0]?.loc?.at(-1);
    if (field === "username") return "Use 3–32 characters: letters, numbers, spaces, @, periods, underscores, plus signs, or hyphens.";
    if (field === "password") return "Use a password between 8 and 128 characters.";
    return "Check the account details and try again.";
  }
  return "We couldn't sign you in. Please try again.";
}

function setMode(nextMode) {
  mode = nextMode;
  const signingUp = mode === "register";
  signInTab.classList.toggle("active", !signingUp);
  signUpTab.classList.toggle("active", signingUp);
  signInTab.setAttribute("aria-selected", String(!signingUp));
  signUpTab.setAttribute("aria-selected", String(signingUp));
  confirmRow.hidden = !signingUp;
  confirmField.required = signingUp;
  confirmField.autocomplete = signingUp ? "new-password" : "off";
  document.querySelector("#form-title").textContent = signingUp ? "Create your account" : "Welcome back";
  document.querySelector("#form-description").textContent = signingUp
    ? "Set up a private space for your documents."
    : "Sign in to pick up where your documents left off.";
  document.querySelector("#password-note").textContent = signingUp ? "At least 8 characters" : "Your account password";
  document.querySelector("#password").autocomplete = signingUp ? "new-password" : "current-password";
  submitButton.querySelector("span").textContent = signingUp ? "Create my account" : "Sign in to workspace";
  errorBox.hidden = true;
}

signInTab.addEventListener("click", () => setMode("login"));
signUpTab.addEventListener("click", () => setMode("register"));
showPassword.addEventListener("click", () => {
  const visible = passwordField.type === "password";
  passwordField.type = visible ? "text" : "password";
  showPassword.textContent = visible ? "Hide" : "Show";
  showPassword.setAttribute("aria-label", visible ? "Hide password" : "Show password");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  if (!form.reportValidity()) return;
  if (mode === "register" && passwordField.value !== confirmField.value) {
    errorBox.textContent = "Those passwords do not match. Please check them and try again.";
    errorBox.hidden = false;
    confirmField.focus();
    return;
  }
  submitButton.disabled = true;
  submitButton.classList.add("loading");
  submitButton.querySelector("span").textContent = mode === "register" ? "Creating your account…" : "Signing you in…";
  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameField.value.trim(), password: passwordField.value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(friendlyApiError(body));
    window.location.assign("/");
  } catch (error) {
    errorBox.textContent = error.message || "Couldn't connect to DocGuard. Check that the app is running.";
    errorBox.hidden = false;
    submitButton.disabled = false;
    submitButton.classList.remove("loading");
    submitButton.querySelector("span").textContent = mode === "register" ? "Create my account" : "Sign in to workspace";
  }
});

fetch("/api/auth/me").then((response) => {
  if (response.ok) window.location.replace("/");
}).catch(() => {});
