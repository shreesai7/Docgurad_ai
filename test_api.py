import asyncio
import sqlite3

import httpx
import pymupdf as fitz
import pytest

from main import create_app, retrieve_relevant_chunks


class ASGIClient:
    def __init__(self, app):
        self.app = app
        self.cookies = httpx.Cookies()
        self.runner = asyncio.Runner()

    def request(self, method, path, **kwargs):
        async def send():
            async with self.app.router.lifespan_context(self.app):
                transport = httpx.ASGITransport(app=self.app)
                async with httpx.AsyncClient(transport=transport, base_url="http://testserver", cookies=self.cookies) as test_client:
                    response = await test_client.request(method, path, **kwargs)
                    if any("docguard_session=null" in value for value in response.headers.get_list("set-cookie")):
                        self.cookies.clear()
                    else:
                        self.cookies.update(response.cookies)
                    return response

        return self.runner.run(send())

    def close(self):
        self.runner.close()

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)

    def delete(self, path, **kwargs):
        return self.request("DELETE", path, **kwargs)


@pytest.fixture
def app(tmp_path):
    return create_app(data_dir=tmp_path, ollama_url="http://ollama.invalid", model="test-model")


@pytest.fixture
def anonymous_client(app):
    test_client = ASGIClient(app)
    yield test_client
    test_client.close()


@pytest.fixture
def client(anonymous_client):
    response = register(anonymous_client)
    assert response.status_code == 201
    return anonymous_client


def register(client, username="testuser", password="correct-horse-123"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def test_register_creates_account_and_starts_session(anonymous_client):
    response = register(anonymous_client)
    assert response.status_code == 201
    assert response.json() == {"id": response.json()["id"], "username": "testuser"}
    assert anonymous_client.get("/api/auth/me").json()["username"] == "testuser"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_registration_accepts_a_username_with_spaces(anonymous_client):
    response = register(anonymous_client, "sai shree")
    assert response.status_code == 201
    assert response.json()["username"] == "sai shree"


def test_author_question_keeps_cover_page_in_retrieved_context():
    text = "[Page 1]\nMultistage Writer Identification Study\nMANABU OKAWA\n" + "\n".join(
        f"[Page {page}]\n" + ("This paper compares previous paper results. " * 10)
        for page in range(2, 9)
    )
    context = "\n".join(retrieve_relevant_chunks(text, "Who wrote this paper?"))
    assert "[Page 1]" in context
    assert "MANABU OKAWA" in context


def test_registration_stores_a_password_hash_not_the_password(anonymous_client, app):
    assert register(anonymous_client, "privateuser", "long-password-123").status_code == 201
    with sqlite3.connect(app.state.data_dir / "docguard.sqlite3") as connection:
        stored = connection.execute("SELECT password_hash FROM users WHERE username = ?", ("privateuser",)).fetchone()[0]
    assert stored != "long-password-123"
    assert stored.startswith("pbkdf2_sha256$")


def test_auth_endpoints_reject_short_password(anonymous_client):
    response = register(anonymous_client, password="short")
    assert response.status_code == 422


def test_username_must_be_unique(anonymous_client):
    assert register(anonymous_client, "alice").status_code == 201
    assert anonymous_client.post("/api/auth/logout").status_code == 204
    assert register(anonymous_client, "ALICE").status_code == 409


def test_signed_out_home_page_offers_sign_in(anonymous_client):
    assert anonymous_client.get("/login").status_code == 200
    response = anonymous_client.get("/")
    assert response.status_code == 200
    assert 'id="signin-link"' in response.text


def test_signed_in_root_renders_the_workspace(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "DocGuard AI" in response.text


def test_login_accepts_valid_password_and_rejects_invalid_password(anonymous_client):
    assert register(anonymous_client, "alice").status_code == 201
    assert anonymous_client.post("/api/auth/logout").status_code == 204
    wrong = anonymous_client.post("/api/auth/login", json={"username": "alice", "password": "wrong-pass-123"})
    assert wrong.status_code == 401
    correct = anonymous_client.post("/api/auth/login", json={"username": "alice", "password": "correct-horse-123"})
    assert correct.status_code == 200
    assert anonymous_client.get("/api/auth/me").json()["username"] == "alice"


def test_protected_document_api_requires_login(anonymous_client):
    assert anonymous_client.get("/api/documents").status_code == 401


def test_logout_ends_session(anonymous_client):
    assert register(anonymous_client).status_code == 201
    assert anonymous_client.post("/api/auth/logout").status_code == 204
    assert anonymous_client.get("/api/auth/me").status_code == 401


def test_accounts_only_see_their_own_documents(app):
    first = ASGIClient(app)
    second = ASGIClient(app)
    try:
        assert register(first, "alice").status_code == 201
        document = upload(first).json()
        assert register(second, "bob").status_code == 201
        assert second.get("/api/documents").json() == []
        assert second.post("/api/chat", json={"document_id": document["id"], "question": "Summarize"}).status_code == 404
        assert second.delete(f"/api/documents/{document['id']}").status_code == 404
    finally:
        first.close()
        second.close()


def test_first_account_inherits_documents_from_pre_login_database(tmp_path):
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "old.pdf").write_bytes(b"old local document")
    with sqlite3.connect(tmp_path / "docguard.sqlite3") as connection:
        connection.execute(
            """CREATE TABLE documents (
                id TEXT PRIMARY KEY, filename TEXT NOT NULL, stored_name TEXT NOT NULL,
                page_count INTEGER NOT NULL, text_content TEXT NOT NULL, created_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
            ("legacy-id", "old.pdf", "old.pdf", 1, "Legacy private text", "2026-01-01T00:00:00+00:00"),
        )
    test_client = ASGIClient(create_app(data_dir=tmp_path))
    try:
        assert register(test_client, "firstaccount").status_code == 201
        documents = test_client.get("/api/documents").json()
        assert [item["id"] for item in documents] == ["legacy-id"]
    finally:
        test_client.close()


def pdf_bytes(text="A sample document about project planning."):
    document = fitz.open()
    page = document.new_page()
    if text:
        page.insert_text((72, 72), text)
    result = document.tobytes()
    document.close()
    return result


def upload(client, name="notes.pdf", content=None):
    return client.post(
        "/api/documents",
        files={"file": (name, content or pdf_bytes(), "application/pdf")},
    )


def test_health_check_reports_ready(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_and_list_text_pdf(client):
    uploaded = upload(client)
    assert uploaded.status_code == 201
    doc_id = uploaded.json()["id"]
    assert uploaded.json()["page_count"] == 1
    listed = client.get("/api/documents")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [doc_id]


def test_upload_rejects_non_pdf(client):
    response = upload(client, "notes.txt", b"plain text")
    assert response.status_code == 415


def test_upload_rejects_pdf_extension_with_non_pdf_content(client):
    response = upload(client, "notes.pdf", b"this is not a PDF")
    assert response.status_code == 415


def test_upload_rejects_damaged_pdf(client):
    response = upload(client, "damaged.pdf", b"%PDF-1.7\nnot a valid document")
    assert response.status_code == 415


def test_upload_rejects_oversized_pdf(client, monkeypatch):
    monkeypatch.setenv("DOCGUARD_MAX_UPLOAD_MB", "0.0001")
    response = upload(client)
    assert response.status_code == 413


def test_upload_rejects_pdf_without_extractable_text(client):
    response = upload(client, content=pdf_bytes(""))
    assert response.status_code == 422
    assert "No readable text" in response.json()["detail"]


def test_chat_requires_question_and_document(client):
    response = client.post("/api/chat", json={"question": "Summarize"})
    assert response.status_code == 422


def test_chat_rejects_whitespace_only_question(client):
    document = upload(client).json()
    response = client.post("/api/chat", json={"document_id": document["id"], "question": "   "})
    assert response.status_code == 422


def test_chat_uses_only_selected_documents_context(client, monkeypatch):
    first = upload(client, "first.pdf", pdf_bytes("The alpha project starts in March." )).json()
    second = upload(client, "second.pdf", pdf_bytes("The beta project starts in October." )).json()
    seen = {}

    async def fake_answer(question, context, **kwargs):
        seen["question"] = question
        seen["context"] = context
        return "The beta project starts in October."

    monkeypatch.setattr("main.generate_answer", fake_answer)
    response = client.post("/api/chat", json={"document_id": second["id"], "question": "When does it start?"})
    assert response.status_code == 200
    assert response.json()["answer"] == "The beta project starts in October."
    assert "October" in seen["context"]
    assert "March" not in seen["context"]


def test_chat_returns_clear_error_when_ollama_unavailable(client, monkeypatch):
    document = upload(client).json()

    async def unavailable(*args, **kwargs):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Ollama is unavailable.")

    monkeypatch.setattr("main.generate_answer", unavailable)
    response = client.post("/api/chat", json={"document_id": document["id"], "question": "Summarize this document."})
    assert response.status_code == 503
    assert response.json()["detail"] == "Ollama is unavailable."


def test_delete_removes_document_from_list_and_storage(client, tmp_path):
    document = upload(client).json()
    response = client.delete(f"/api/documents/{document['id']}")
    assert response.status_code == 204
    assert client.get("/api/documents").json() == []
    assert not list((tmp_path / "uploads").iterdir())


def test_chat_rejects_unknown_document(client):
    response = client.post("/api/chat", json={"document_id": "missing", "question": "Hello?"})
    assert response.status_code == 404


def test_broad_summary_question_gets_representative_chunks():
    text = "Opening details. " + "unrelated filler words " * 700
    chunks = retrieve_relevant_chunks(text, "Summarize this document.")
    assert len(chunks) == 5
    assert chunks[0].startswith("Opening details.")
