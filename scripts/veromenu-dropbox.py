"""Upload today's VeroMenu backup to Dropbox (app folder of the existing kasa-pizero-yedek app, subfolder /veromenu)
and keep the last KEEP days. Runs after /usr/local/bin/veromenu-backup (installed 2026-11-04).
Needs DROPBOX_APP_KEY + DROPBOX_REFRESH_TOKEN in /etc/veromenu/dropbox.env. File: veromenu-YYYY-MM-DD.tar.enc =
AES-256 (openssl enc, PBKDF2) of db dump + uploads tar + .env. Password: /etc/veromenu/backup.pass (root 600);
İbrahim keeps a copy in his password manager; Claude never reads it.
Restore: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in veromenu-DATE.tar.enc -out vm.tar && tar xf vm.tar
"""
import datetime as dt, io, json, os, subprocess, sys, tarfile, urllib.parse, urllib.request
from pathlib import Path
SRC = Path("/var/backups/veromenu"); KEEP = int(os.environ.get("DROPBOX_KEEP_DAYS", "7"))
PASSFILE = "/etc/veromenu/backup.pass"; FOLDER = "/veromenu"
OPENSSL = ["-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-salt"]
def env():
    for l in open("/etc/veromenu/dropbox.env"):
        if "=" in l and not l.startswith("#"):
            k, v = l.strip().split("=", 1); os.environ.setdefault(k, v.strip('"'))
def token():
    b = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": os.environ["DROPBOX_REFRESH_TOKEN"],
                                "client_id": os.environ["DROPBOX_APP_KEY"]}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://api.dropboxapi.com/oauth2/token", data=b), timeout=30) as r:
        return json.load(r)["access_token"]
def api(t, ep, a):
    r = urllib.request.Request(f"https://api.dropboxapi.com/2/{ep}", data=json.dumps(a).encode() if a is not None else b"null",
                               headers={"Authorization": f"Bearer {t}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as x: return json.load(x)
def upload(t, path, data):
    CH = 32 * 1024 * 1024
    h = {"Authorization": f"Bearer {t}", "Content-Type": "application/octet-stream"}
    def post(ep, arg, chunk):
        r = urllib.request.Request(f"https://content.dropboxapi.com/2/files/{ep}", data=chunk,
                                   headers={**h, "Dropbox-API-Arg": json.dumps(arg)})
        with urllib.request.urlopen(r, timeout=600) as x: return json.load(x) if x.length != 0 else {}
    sid = post("upload_session/start", {"close": False}, data[:CH])["session_id"]; off = len(data[:CH])
    while off + CH < len(data):
        post("upload_session/append_v2", {"cursor": {"session_id": sid, "offset": off}, "close": False}, data[off:off+CH]); off += CH
    return post("upload_session/finish", {"cursor": {"session_id": sid, "offset": off},
                "commit": {"path": path, "mode": "overwrite", "mute": True}}, data[off:])
def main():
    env(); day = sys.argv[1] if len(sys.argv) > 1 else dt.date.today().isoformat()
    files = [SRC / f"db-{day}.dump", SRC / f"data-{day}.tar.gz", SRC / f"env-{day}"]
    for f in files:
        if not f.exists(): sys.exit(f"missing {f}")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for f in files: tar.add(f, arcname=f.name)
    data = subprocess.run(["openssl", "enc", *OPENSSL, "-pass", f"file:{PASSFILE}"], input=buf.getvalue(),
                          capture_output=True, check=True).stdout
    t = token(); m = upload(t, f"{FOLDER}/veromenu-{day}.tar.enc", data)
    print(f"uploaded {m['path_display']} ({m['size']} bytes)")
    res = api(t, "files/list_folder", {"path": FOLDER}); es = res["entries"]
    while res.get("has_more"):
        res = api(t, "files/list_folder/continue", {"cursor": res["cursor"]}); es += res["entries"]
    names = sorted(e["name"] for e in es if e[".tag"] == "file" and e["name"].startswith("veromenu-"))
    for n in names[:-KEEP] if len(names) > KEEP else []:
        api(t, "files/delete_v2", {"path": f"{FOLDER}/{n}"}); print("deleted", n)
    u = api(t, "users/get_space_usage", None)
    print(f"dropbox used {u['used']/1e9:.2f} GB of {u.get('allocation',{}).get('allocated',0)/1e9:.2f} GB")
if __name__ == "__main__": main()
