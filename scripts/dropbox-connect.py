"""One-time: connect the Dropbox app "veromenu-yedek" (app folder) to the prod backup on myserver.

Two steps (works without an interactive terminal):
  python3 scripts/dropbox-connect.py           -> opens the consent page; click "Allow", copy the code
  python3 scripts/dropbox-connect.py <CODE>    -> exchanges the code (PKCE, no app secret) for a refresh token,
                                                 writes /etc/veromenu/dropbox.env on myserver (root 600), test upload
The token is never printed. The PKCE verifier is kept in ~/.veromenu-dropbox-verifier (600) between the steps.
"""
import base64, hashlib, json, os, secrets, subprocess, sys, urllib.parse, urllib.request, webbrowser
from pathlib import Path

APP_KEY = "prspicu2jiegrfw"
VF = Path.home() / ".veromenu-dropbox-verifier"

if len(sys.argv) < 2:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    VF.write_text(verifier); VF.chmod(0o600)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    url = "https://www.dropbox.com/oauth2/authorize?" + urllib.parse.urlencode({
        "client_id": APP_KEY, "response_type": "code", "token_access_type": "offline",
        "code_challenge": challenge, "code_challenge_method": "S256"})
    webbrowser.open(url)
    print("Dropbox consent page opened. Click Allow, then run:\n  python3 scripts/dropbox-connect.py <CODE>\n\n" + url)
    sys.exit(0)

code = sys.argv[1].strip()
verifier = VF.read_text().strip()
body = urllib.parse.urlencode({"code": code, "grant_type": "authorization_code",
                               "client_id": APP_KEY, "code_verifier": verifier}).encode()
with urllib.request.urlopen(urllib.request.Request("https://api.dropboxapi.com/oauth2/token", data=body), timeout=30) as r:
    tok = json.load(r)
if "refresh_token" not in tok:
    sys.exit("No refresh token returned.")
env = f"DROPBOX_APP_KEY={APP_KEY}\nDROPBOX_REFRESH_TOKEN={tok['refresh_token']}\n"
subprocess.run(["ssh", "myserver",
                "umask 077; mkdir -p /etc/veromenu && cat > /etc/veromenu/dropbox.env && chmod 600 /etc/veromenu/dropbox.env"],
               input=env.encode(), check=True)
VF.unlink(missing_ok=True)
print("Saved /etc/veromenu/dropbox.env on myserver. Running a test upload...")
subprocess.run(["ssh", "myserver", "/usr/bin/python3 /usr/local/bin/veromenu-dropbox"], check=True)
print("Done.")
