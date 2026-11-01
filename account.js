const logoutButton = document.querySelector("#logout-button");
const signInActions = document.querySelector("#signin-actions");
const signInUpload = document.querySelector("#signin-upload");
const accountControl = document.querySelector(".account-control");

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) {
      if (response.status === 401) {
        document.body.classList.add("signed-out");
        signInActions.hidden = false;
        signInUpload.hidden = false;
        accountControl.hidden = true;
        document.querySelector("#no-document-note").textContent = "Sign in to upload and chat with your PDFs";
      }
      return;
    }
    const account = await response.json();
    document.body.classList.remove("signed-out");
    signInActions.hidden = true;
    signInUpload.hidden = true;
    accountControl.hidden = false;
    document.querySelector("#account-name").textContent = account.username;
    document.querySelector("#account-avatar").textContent = account.username.slice(0, 1).toUpperCase();
  } catch (_) {
    // The next API request displays the connection error in the workspace.
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  } catch (_) {
    logoutButton.disabled = false;
  }
});

loadAccount();
