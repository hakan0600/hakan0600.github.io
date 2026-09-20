"""YÖKDİL Kelime masaüstü başlatıcısı: küçük yerel sunucuyu gizli başlatır, Edge'i uygulama penceresinde açar, pencere kapanınca çıkar."""
import ctypes
import http.server
import glob
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8765
URL = f"http://127.0.0.1:{PORT}/"
PROFILE = ROOT / "data" / "edge-profile"
LAUNCHER_LOG = ROOT / "data" / "launcher.log"
SYNC_FILE = ROOT / "data" / "sync.json"
NO_WINDOW = subprocess.CREATE_NO_WINDOW
EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# Bu programın özel Edge profilini kullanan süreçleri bulur.
PROFILE_PIDS = (
    "$p = (Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" "
    "| Where-Object { $_.CommandLine -like '*yokdil-kelime*edge-profile*' }).ProcessId; "
)


def log(text):
    LAUNCHER_LOG.parent.mkdir(exist_ok=True)
    with open(LAUNCHER_LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%H:%M:%S')} {text}\n")


def message(text):
    ctypes.windll.user32.MessageBoxW(0, text, "YÖKDİL Kelime", 0x10)


def powershell(script):
    result = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True, text=True, creationflags=NO_WINDOW, timeout=30,
    )
    return result.stdout.strip()


def profile_windows():
    out = powershell(
        PROFILE_PIDS
        + "if ($p) { (Get-Process -Id $p -ErrorAction SilentlyContinue "
        "| Where-Object { $_.MainWindowHandle -ne 0 }).Count } else { 0 }"
    )
    return int(out) if out.isdigit() else 0


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows kayıt defterindeki yanlış MIME eşlemelerine güvenmiyoruz.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html; charset=utf-8",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".png": "image/png",
        ".traineddata": "application/octet-stream",
    }

    # Sunucu artık yerel ağa açık (telefon için). Yalnızca uygulamanın kendi dosyaları sunulur;
    # data/ (tarayıcı profili, kayıtlı kelimeler), .git, testler ve betikler asla sunulmaz.
    ALLOWED = ("/index.html", "/manifest.webmanifest", "/sw.js", "/version.json", "/css/", "/js/", "/icons/", "/vendor/")

    def _allowed(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        return path == "/" or path.startswith(self.ALLOWED)

    def send_head(self):
        if not self._allowed():
            self.send_error(403, "Yasak")
            return None
        return super().send_head()

    # Bilgisayar ile telefon arasında kelime aktarımı: bilgisayardaki uygulama yedeği buraya bırakır (yalnızca bu bilgisayardan),
    # telefondaki uygulama alır. Süre sınırı yok, okununca silinmez (birden çok cihaz/deneme için); yeni gönderim üzerine yazar. Dosya data/ altında durur ve başka hiçbir yolla sunulmaz.
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/__sync" or self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(403, "Yasak")
            return
        size = int(self.headers.get("Content-Length", 0))
        if size <= 0 or size > 8_000_000:
            self.send_error(413, "Geçersiz boyut")
            return
        data = self.rfile.read(size)
        try:
            n = len(json.loads(data.decode("utf-8"))["words"])
        except (ValueError, KeyError, UnicodeDecodeError):
            self.send_error(400, "Geçersiz yedek")
            return
        SYNC_FILE.parent.mkdir(exist_ok=True)
        SYNC_FILE.write_bytes(data)
        gid, err = publish_gist()
        body = json.dumps({"ok": True, "n": n, "gist": gid, "gistError": err}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route in ("/__sync", "/__yedek"):
            body = read_sync()
            if body is None:
                self.send_error(404, "Bilgisayardan gönderilmiş kelime yok")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            if route == "/__yedek":  # telefonda dosya olarak inen yedek (barındırılan sürüme "Yedeği yükle" ile aktarılır)
                self.send_header("Content-Disposition", 'attachment; filename="yokdil-kelimeler.json"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.split("?", 1)[0] == "/__lan":
            body = json.dumps({"ip": lan_ip(), "port": self.server.server_address[1]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):  # pythonw'de stderr yok
        pass


def server_ready():
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return "YÖKDİL" in r.read().decode("utf-8", "ignore")
    except OSError:
        return False


def find_gh():
    """GitHub CLI (gh) yolu: PATH'te ya da winget kurulumunda."""
    import shutil
    found = shutil.which("gh")
    if found:
        return found
    hits = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.cli_*\bin\gh.exe"))
    return hits[0] if hits else None


GIST_FILE = "yokdil-kelimeler.json"


def publish_gist():
    """Aktarma kutusunu GitHub hesabında GİZLİ bir gist'e yazar (her ağdan, adresi bilen alabilir). Dönüş: (gist_id, hata)."""
    gh = find_gh()
    if not gh:
        return None, "GitHub CLI (gh) bulunamadı"
    idf = SYNC_FILE.parent / "gist.id"
    content = SYNC_FILE.read_text(encoding="utf-8")
    files = {"files": {GIST_FILE: {"content": content}}}
    def call(method, path, body):
        return subprocess.run([gh, "api", "-X", method, path, "--input", "-"], input=json.dumps(body).encode("utf-8"),
                              capture_output=True, timeout=90, creationflags=NO_WINDOW)
    if idf.exists():
        gid = idf.read_text().strip()
        r = call("PATCH", f"gists/{gid}", files)
        if r.returncode == 0:
            return gid, None
    r = call("POST", "gists", {"description": "YÖKDİL Kelime yedeği (gizli bağlantı)", "public": False, **files})
    if r.returncode != 0:
        return None, (r.stderr or r.stdout).decode("utf-8", "ignore").strip()[:200]
    gid = json.loads(r.stdout.decode("utf-8"))["id"]
    idf.write_text(gid)
    return gid, None


def read_sync():
    """Aktarma kutusu: süre sınırı yok, okununca silinmez; yeni "gönder" eskisinin üzerine yazar."""
    try:
        return SYNC_FILE.read_bytes()
    except OSError:
        return None


def lan_ip():
    """Bu bilgisayarın yerel ağdaki adresi (paket göndermeden, yönlendirme tablosundan)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sk:
            sk.connect(("10.255.255.255", 1))
            return sk.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def start_server(port=PORT):
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def wait_until_windows_closed():
    for _ in range(30):
        if profile_windows() > 0:
            break
        time.sleep(1)
    else:
        log("pencere görünmedi")
        return
    misses = 0
    while misses < 2:
        time.sleep(2)
        misses = misses + 1 if profile_windows() == 0 else 0
    log("pencere kalmadı")


def run_service():
    """Arka plan modu (--service): pencere açmaz, kapanmaz. Bilgisayar açılınca çalışır; telefon ve tarayıcılar her zaman bağlanabilir."""
    log("hizmet modu başlatıldı")
    if server_ready():
        log("sunucu zaten çalışıyor, hizmet çıkıyor")
        return
    try:
        start_server()
    except OSError as e:
        log(f"hizmet sunucusu başlatılamadı: {e}")
        return
    log("hizmet sunucusu hazır")
    while True:
        time.sleep(3600)


def main():
    if "--service" in sys.argv:
        run_service()
        return
    log("başlatıcı açıldı")
    server = None
    if not server_ready():
        try:
            server = start_server()
        except OSError as e:
            log(f"sunucu başlatılamadı: {e}")
            message(f"Program başlatılamadı: {PORT} numaralı bağlantı noktası başka bir program tarafından kullanılıyor.")
            return
        log("sunucu başlatıldı")

    edge = next((p for p in EDGE_PATHS if os.path.exists(p)), None)
    if edge is None:
        webbrowser.open(URL)
        if server:
            time.sleep(3600)  # tarayıcı sekmesi için sunucu açık kalsın
        return

    PROFILE.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([
        edge, f"--app={URL}", f"--user-data-dir={PROFILE}", "--window-size=1100,700",
        "--no-first-run", "--no-default-browser-check", "--disable-background-mode",
    ])
    if server is not None:
        wait_until_windows_closed()
        server.shutdown()
        log("sunucu durduruldu")


if __name__ == "__main__":
    main()
