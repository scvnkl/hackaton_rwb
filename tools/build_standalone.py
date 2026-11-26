"""Build the portable v12 from the same application used by index.html."""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stylesheet(match):
    path = ROOT / match[1]
    def asset(ref):
        target = path.parent / ref[1]
        if not target.is_file():
            return ref[0]
        data = base64.b64encode(target.read_bytes()).decode()
        return f'url(data:{mimetypes.guess_type(target)[0]};base64,{data})'
    css = re.sub(r'url\(["\']?([^"\')]+)["\']?\)', asset, path.read_text())
    return "<style>" + css + "</style>"


def build():
    html = (ROOT / "index.html").read_text()
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/>', stylesheet, html)
    scripts = []
    def inline(match):
        source = (ROOT / match[1]).read_text()
        source = re.sub(r"</script", lambda _: r"<\/script", source, flags=re.I)
        scripts.append("<script>\n" + source + "\n</script>")
        return ""
    html = re.sub(r'<script defer src="([^"]+)"></script>', inline, html)
    return html.replace("</body>", "\n".join(scripts) + "\n</body>")


if __name__ == "__main__":
    (ROOT / "pvz-wb-real-streets-v12.html").write_text(build(), encoding="utf8")
