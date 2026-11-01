# DocGuard AI — Chat with Your PDF

DocGuard AI is a local-first PDF chatbot built using Python, FastAPI, SQLite, PyMuPDF, HTML, CSS, JavaScript, and Ollama.

It allows users to create local accounts, upload text-based PDF documents into a private library, and ask questions based on relevant document passages. User records, uploaded files, the session signing secret, and the database are stored locally in the project's private `data/` folder.

No paid API key is required.

## Features

- Upload PDFs up to **15 MB**.
- Extract selectable PDF text using PyMuPDF.
- Optionally perform OCR on scanned pages using Tesseract.
- Preview uploaded PDFs inside the application.
- Delete documents with confirmation.
- Store documents in a local SQLite database and private upload directory.
- Provide separate document libraries for individual user accounts.
- Support local account registration and login.
- Secure passwords using PBKDF2 hashing.
- Use signed, HTTP-only session cookies.
- Protect document and chat APIs from unauthorized access.
- Provide a sign-out option in the workspace header.
- Display a responsive interface for desktop and mobile devices.
- Retrieve relevant document passages and preserve page numbers.
- Support name-focused retrieval for questions about people.
- Generate answers using a locally hosted Ollama model.
- Cite PDF page numbers in generated answers.
- Re-read previously stored PDFs for page-aware retrieval and OCR.
- Provide suggested questions, loading states, and readable error messages.
- Provide an OpenAPI interface at `http://127.0.0.1:8000/docs`.

## Hardware Requirements and Local Model

The default AI model is **Qwen 2.5 3B (`qwen2.5:3b`)**.

Ollama lists this quantized model at approximately **1.9 GB**.

On an 8 GB RAM, CPU-only Intel i3 laptop, this is a reasonable small-model starting point. However, response generation may be slow, and actual memory consumption depends on the operating system, context size, and other running applications.

If the 3B model is too slow, you can use the smaller model:

`qwen2.5:1.5b`

Its approximate download size is 986 MB, although answer quality may be lower.

For current model sizes, refer to the [Ollama Qwen 2.5 Model Library](https://ollama.com/library/qwen2.5).

## Installation and Setup

### Run on Linux

Open a terminal inside the project directory.

### 1. Install System Packages and Python Dependencies

**For Fedora:**

```bash
sudo dnf install -y python3 python3-pip

python3 -m venv .venv

source .venv/bin/activate

python -m pip install --upgrade pip

pip install -r requirements.txt
```

**For Debian/Ubuntu:**

```bash
sudo apt update

sudo apt install -y python3 python3-venv python3-pip

python3 -m venv .venv

source .venv/bin/activate

python -m pip install --upgrade pip

pip install -r requirements.txt
```

### 2. Install Tesseract OCR (Optional)

For scanned PDF support, install Tesseract.

**Fedora:**

```bash
sudo dnf install -y tesseract tesseract-langpack-eng
```

**Debian/Ubuntu:**

```bash
sudo apt install -y tesseract-ocr tesseract-ocr-eng
```

### 3. Install and Start Ollama

Install Ollama using its official Linux installation instructions.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Enable and start the Ollama service:

```bash
sudo systemctl enable --now ollama
```

Download the default AI model:

```bash
ollama pull qwen2.5:3b
```

Alternatively, download the smaller model:

```bash
ollama pull qwen2.5:1.5b
```

### 4. Start DocGuard AI

Activate the virtual environment if it is not already active:

```bash
source .venv/bin/activate
```

Start the FastAPI application:

```bash
python -m uvicorn main:app --reload
```

Open the application in your browser:

**Application:** http://127.0.0.1:8000

**API Documentation:** http://127.0.0.1:8000/docs

To stop the application, press `Ctrl + C` in the terminal.

## Configuration

The following environment variables are optional:

| Variable | Default Value | Description |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen2.5:3b` | AI model configured in Ollama |
| `DOCGUARD_MAX_UPLOAD_MB` | `15` | Maximum PDF upload size in MB |

To run the application with the smaller model:

```bash
OLLAMA_MODEL=qwen2.5:1.5b python -m uvicorn main:app --reload
```

## Runtime Storage

The application automatically creates the following runtime files:

```text
data/
├── docguard.sqlite3
├── uploads/
└── .session_secret
```

- `docguard.sqlite3` stores user and document records.
- `uploads/` stores uploaded PDF documents.
- `.session_secret` stores the session signing secret.

These files are ignored by Git and are not included in the source ZIP.

When upgrading an older project that already contains documents but does not have user accounts, the first registered account adopts the existing documents. Subsequent accounts receive separate document libraries.

On Linux, the session secret and local documents are stored with owner-only filesystem permissions.

## Running Tests

Activate the virtual environment and execute:

```bash
python -m pytest -q
```

The automated tests cover:

- Account registration and login.
- Password validation.
- User logout.
- Session authentication and protection.
- Per-account document isolation.
- Application health endpoint.
- Valid and invalid PDF uploads.
- Configured upload size limits.
- Textless PDF handling.
- Document listing.
- Selected-document context isolation during chat.
- Missing-document and chat validation.
- Ollama-unavailable error handling.
- Document deletion from the database and upload directory.

## Manual Verification

Follow these steps to verify the application:

1. Start Ollama, download the configured model, and run the application.
2. Open the website and create a new account.
3. Confirm that the workspace displays the account name and logout button.
4. Upload a text-based PDF under 15 MB.
5. Confirm that the uploaded document appears in the library.
6. Ask a question whose answer is available in the PDF.
7. Ask a question whose answer is not present and verify that the model does not invent an answer.
8. Log out and create a second account.
9. Confirm that the second account cannot access the first account's documents.
10. Test invalid files, damaged PDFs, scanned PDFs, and PDFs larger than 15 MB.
11. Stop Ollama and ask a question to verify that a readable error message appears.
12. Delete a document and confirm that it disappears from the sidebar and `data/uploads/`.

## Troubleshooting

| Problem | Solution |
|---|---|
| Ollama unavailable | Ensure the Ollama service is running and verify `OLLAMA_URL`. Run `ollama list`. |
| Model missing | Run `ollama pull qwen2.5:3b` or download the model specified in `OLLAMA_MODEL`. |
| Slow responses | Close memory-heavy applications, use a smaller PDF, or switch to `qwen2.5:1.5b`. |
| Request timeout | CPU-only generation can take time. The request timeout is 90 seconds. |
| Scanned PDF is not readable | Install Tesseract OCR and upload the PDF again. |
| Incorrect answer | Preview the cited PDF page and verify the original document content. |
| Virtual environment creation fails | Install `python3-venv` using your distribution's package manager. |
| Port 8000 is busy | Start the application using port 8001. |

Alternative port command:

```bash
python -m uvicorn main:app --reload --port 8001
```

Open http://127.0.0.1:8001.

## Project Structure

```text
DocGuard_AI/
│
├── main.py
├── requirements.txt
├── pytest.ini
├── README.md
├── .gitignore
│
├── static/
│   ├── index.html
│   ├── login.html
│   ├── auth.css
│   ├── auth.js
│   ├── account.js
│   ├── polish.css
│   ├── style.css
│   └── app.js
│
├── data/
│   └── .gitkeep
│
└── tests/
    └── test_api.py
```

## Project Abstract

DocGuard AI is a local PDF question-answering web application designed to help users explore and understand the contents of PDF documents.

The application extracts PDF text using PyMuPDF, retrieves relevant passages through a lightweight keyword-based retrieval approach, and uses a locally hosted Ollama language model to generate concise answers.

FastAPI handles backend operations, while SQLite stores user account and document information. The responsive frontend supports user registration, login, PDF upload, document selection, chat interactions, logout, and document deletion.

The application uses PBKDF2 password hashing, signed sessions, and separate document libraries for individual accounts. It operates locally without requiring any paid AI API.

## Resume Description

**DocGuard AI — Chat with Your PDF**

Developed a local-first PDF chatbot using Python, FastAPI, SQLite, PyMuPDF, and Ollama. Implemented local user registration and authentication with PBKDF2 password hashing, signed sessions, per-user document isolation, PDF validation and text extraction, overlapping chunk retrieval, context-based AI responses, page citations, and a responsive web interface.

## Security and Limitations

DocGuard AI is designed for local student portfolio and demonstration purposes.

User accounts are local to the application and do not include email verification or password recovery.

The application is not production-secure. Do not expose it to the public internet without HTTPS, account recovery mechanisms, abuse controls, and additional security review.
