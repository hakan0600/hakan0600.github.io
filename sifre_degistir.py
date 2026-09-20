"""İnternetteki sürümün şifresini değiştirir. Kullanım: python sifre_degistir.py YENI-SIFRE
Sonra değişikliği yayınla (git add -A; git commit; git push). Eski şifreyle giriş yapmış cihazlar yeniden şifre sorar."""
import hashlib
import re
import sys
from pathlib import Path

if len(sys.argv) != 2 or len(sys.argv[1].strip()) < 4:
    sys.exit("Kullanım: python sifre_degistir.py YENI-SIFRE (en az 4 karakter)")
gate = Path(__file__).resolve().parent / "js" / "gate.js"
src = gate.read_text(encoding="utf-8")
salt = re.search(r"const SALT = '([^']+)'", src).group(1)
digest = hashlib.sha256(f"{salt}:{sys.argv[1].strip()}".encode("utf-8")).hexdigest()
gate.write_text(re.sub(r"const HASH = '[0-9a-f]+'", f"const HASH = '{digest}'", src), encoding="utf-8")
print("Şifre güncellendi. Yeniden yayınla.")
