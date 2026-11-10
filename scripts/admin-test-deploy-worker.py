#!/usr/bin/env python3
"""Install outside the app root; invoke once per minute using cPanel Cron Jobs."""

import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import time
import zipfile


APP_ROOT = Path("/home/forv3510/admin-test.naturalfarmingvietnam.com")
CPANEL_MODULES = Path(
    "/home/forv3510/nodevenv/admin-test.naturalfarmingvietnam.com/20/lib/node_modules"
)
RELEASE_PATTERN = re.compile(r"[a-f0-9]{40}-[0-9]+-[0-9]+")


def atomic_write(path, content):
    fd, temporary = tempfile.mkstemp(prefix=".nfv-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_archive(archive, root):
    names = set()
    total = 0
    modules = root / "node_modules"
    allowed = [root.resolve()]
    if modules.is_symlink() and root == APP_ROOT:
        if modules.resolve() != CPANEL_MODULES.resolve():
            raise ValueError("Unexpected cPanel node_modules target")
        allowed.append(CPANEL_MODULES.resolve())
    entries = archive.infolist()
    if len(entries) > 50000:
        raise ValueError("Too many ZIP entries")
    for entry in entries:
        path = PurePosixPath(entry.filename)
        if (
            not path.parts
            or path.is_absolute()
            or ".." in path.parts
            or "\\" in entry.filename
            or ":" in entry.filename
            or path.parts[0]
            not in {"server.js", "package.json", ".next", "node_modules", "public"}
            or any(
                part.startswith(".env") or part == ".htaccess" for part in path.parts
            )
            or stat.S_ISLNK(entry.external_attr >> 16)
            or entry.filename in names
        ):
            raise ValueError("Unsafe or duplicate ZIP entry")
        names.add(entry.filename)
        total += entry.file_size
        if total > 1024**3:
            raise ValueError("ZIP exceeds 1 GiB expanded size")
        destination = (root / entry.filename).resolve()
        if not any(destination.is_relative_to(base) for base in allowed):
            raise ValueError("Destination escapes application directory")
    if not {"server.js", "package.json"}.issubset(names):
        raise ValueError("Missing Passenger entry point")
    if not any(n.startswith(".next/static/") for n in names):
        raise ValueError("Missing static assets")
    if not any(n.startswith("node_modules/") for n in names):
        raise ValueError("Missing runtime dependencies")
    if archive.testzip() is not None:
        raise ValueError("ZIP CRC check failed")


def install_release(root, queue, release, request):
    manifest = json.loads(request.read_text())
    if manifest.get("release") != release:
        raise ValueError("Manifest release mismatch")
    bundle = queue / (release + ".zip")
    if bundle.is_symlink():
        raise ValueError("ZIP must not be a symlink")
    with bundle.open("rb") as stream:
        hasher = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
        digest = hasher.hexdigest()
    if manifest.get("sha256") != digest:
        raise ValueError("ZIP SHA-256 mismatch")
    for name in [".env.local", ".htaccess", "server.js"]:
        if not (root / name).is_file():
            raise ValueError("Passenger application is not configured")
    with tempfile.TemporaryDirectory(prefix="extract-", dir=queue) as stage:
        stage = Path(stage)
        with zipfile.ZipFile(bundle) as archive:
            validate_archive(archive, root)
            archive.extractall(stage)
            modes = {
                i.filename: (i.external_attr >> 16) & 0o777 for i in archive.infolist()
            }
        files = sorted(p for p in stage.rglob("*") if p.is_file())
        # All validation finishes before application writes. Replace server.js last.
        files.sort(key=lambda p: p.relative_to(stage).as_posix() == "server.js")
        for source in files:
            relative = source.relative_to(stage)
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix=".nfv-", dir=target.parent)
            os.close(fd)
            try:
                shutil.copyfile(source, temporary)
                os.chmod(temporary, modes.get(relative.as_posix()) or 0o644)
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
    atomic_write(root / "tmp/restart.txt", release)
    return digest


def process_queue(root=APP_ROOT):
    root = Path(root)
    queue = root / "tmp/nfv-deploy"
    if not queue.resolve().is_relative_to(root.resolve()):
        raise ValueError("Deploy queue escapes app root")
    queue.mkdir(parents=True, exist_ok=True)
    atomic_write(queue / ".htaccess", "Require all denied\n")
    with (queue / "worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        atomic_write(
            queue / "worker.json", json.dumps({"protocol": 1, "time": time.time()})
        )
        pending = [
            request
            for request in queue.glob("*.ready.json")
            if RELEASE_PATTERN.fullmatch(request.name.removesuffix(".ready.json"))
            and not request.is_symlink()
        ]
        for request in sorted(
            pending, key=lambda p: release_order(p.name.removesuffix(".ready.json"))
        ):
            release = request.name.removesuffix(".ready.json")
            if not RELEASE_PATTERN.fullmatch(release) or request.is_symlink():
                continue
            result = queue / (release + ".result.json")
            if result.exists():
                request.unlink()
                continue
            receipt = {"release": release}
            try:
                restart = root / "tmp/restart.txt"
                installed = restart.read_text().strip() if restart.exists() else ""
                if RELEASE_PATTERN.fullmatch(installed) and release_order(
                    release
                ) < release_order(installed):
                    raise ValueError("A newer release has already been installed")
                receipt["sha256"] = install_release(root, queue, release, request)
                receipt["status"] = "deployed"
            except Exception as error:
                receipt.update(status="failed", error=str(error))
            atomic_write(result, json.dumps(receipt))
            request.unlink()
            if receipt["status"] == "deployed":
                (queue / (release + ".zip")).unlink(missing_ok=True)
            print(json.dumps(receipt), flush=True)


def release_order(release):
    # SHA prefixes have no chronological ordering; GitHub run ID/attempt do.
    _, run_id, attempt = release.rsplit("-", 2)
    return int(run_id), int(attempt)


if __name__ == "__main__":
    process_queue()
