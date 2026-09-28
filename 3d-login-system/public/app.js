const card = document.getElementById("cardWrap");
const form = document.getElementById("authForm");
const title = document.getElementById("title");
const subtitle = document.getElementById("subtitle");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("name");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const switchMode = document.getElementById("switchMode");
const switchText = document.getElementById("switchText");
const loginOptions = document.getElementById("loginOptions");
const submitButton = document.getElementById("submitButton");
const buttonText = document.getElementById("buttonText");
const spinner = document.getElementById("spinner");
const message = document.getElementById("message");
const strength = document.getElementById("strength");
const strengthFill = document.getElementById("strengthFill");
const strengthText = document.getElementById("strengthText");

let registerMode = false;

for (let i = 0; i < 28; i++) {
  const p = document.createElement("span");
  p.style.left = `${Math.random() * 100}%`;
  p.style.top = `${60 + Math.random() * 40}%`;
  p.style.animationDelay = `${Math.random() * 5}s`;
  p.style.animationDuration = `${3 + Math.random() * 5}s`;
  document.getElementById("particles").appendChild(p);
}

document.addEventListener("mousemove", (event) => {
  const x = (innerWidth / 2 - event.clientX) / 35;
  const y = (innerHeight / 2 - event.clientY) / 35;
  card.style.transform = `rotateY(${-x}deg) rotateX(${y}deg)`;
});

document.addEventListener("mouseleave", () => {
  card.style.transform = "rotateY(0deg) rotateX(0deg)";
});

togglePassword.addEventListener("click", () => {
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  togglePassword.textContent = visible ? "👁" : "🙈";
});

password.addEventListener("input", () => {
  if (!registerMode) {
    strength.hidden = true;
    return;
  }

  const value = password.value;
  strength.hidden = !value;

  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  const labels = ["Very weak", "Weak", "Medium", "Strong", "Very strong"];
  const widths = ["20%", "40%", "60%", "80%", "100%"];

  strengthFill.style.width = widths[score] || "0%";
  strengthText.textContent = labels[score] || "";
});

switchMode.addEventListener("click", () => {
  registerMode = !registerMode;

  nameField.hidden = !registerMode;
  nameInput.required = registerMode;
  strength.hidden = !registerMode;

  if (registerMode) {
    title.textContent = "Create Account";
    subtitle.textContent = "Create your secure account.";
    switchText.textContent = "Already have an account?";
    switchMode.textContent = "Sign in";
    buttonText.textContent = "CREATE ACCOUNT";
    loginOptions.hidden = true;
    password.autocomplete = "new-password";
  } else {
    title.textContent = "Welcome Back";
    subtitle.textContent = "Sign in to continue to your account.";
    switchText.textContent = "Don't have an account?";
    switchMode.textContent = "Create account";
    buttonText.textContent = "SIGN IN";
    loginOptions.hidden = false;
    password.autocomplete = "current-password";
  }

  clearMessage();
  form.reset();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const payload = {
    email: document.getElementById("email").value.trim(),
    password: password.value
  };

  if (registerMode) {
    payload.name = nameInput.value.trim();
  }

  setLoading(true);

  try {
    const response = await fetch(
      registerMode ? "/api/register" : "/api/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    showMessage(data.message, "success");

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 600);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  submitButton.disabled = loading;
  spinner.hidden = !loading;
  buttonText.hidden = loading;
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function clearMessage() {
  message.textContent = "";
  message.className = "message";
}

function demoSocial() {
  showMessage("Google/GitHub OAuth is not configured in this local demo.", "error");
}
