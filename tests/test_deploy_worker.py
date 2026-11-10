import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


WORKER = Path(__file__).parents[1] / "scripts/admin-test-deploy-worker.py"
RELEASE = "a" * 40 + "-123-1"


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "app"
        self.root.mkdir()
        (self.root / ".env.local").write_text("private")
        (self.root / ".htaccess").write_text("passenger config")
        (self.root / "server.js").write_text("old server")
        spec = importlib.util.spec_from_file_location("worker", WORKER)
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)
        self.worker.process_queue(self.root)
        self.queue = self.root / "tmp/nfv-deploy"

    def bundle(self, extra=None, bad_hash=False):
        (self.queue / (RELEASE + ".result.json")).unlink(missing_ok=True)
        archive = self.queue / (RELEASE + ".zip")
        files = {
            "server.js": "new server",
            "package.json": "{}",
            ".next/static/a.js": "asset",
            "node_modules/pkg/index.js": "package",
            "public/a.txt": "public",
        }
        files.update(extra or {})
        with zipfile.ZipFile(archive, "w") as z:
            for name, content in files.items():
                z.writestr(name, content)
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        manifest = {"release": RELEASE, "sha256": "0" * 64 if bad_hash else digest}
        (self.queue / (RELEASE + ".ready.json")).write_text(json.dumps(manifest))

    def result(self):
        return json.loads((self.queue / (RELEASE + ".result.json")).read_text())

    def test_valid_bundle_preserves_config_and_restarts(self):
        self.bundle()
        self.worker.process_queue(self.root)
        self.assertEqual((self.root / "server.js").read_text(), "new server")
        self.assertEqual((self.root / ".env.local").read_text(), "private")
        self.assertEqual((self.root / ".htaccess").read_text(), "passenger config")
        self.assertEqual((self.root / "tmp/restart.txt").read_text(), RELEASE)
        self.assertEqual(self.result()["status"], "deployed")
        self.assertEqual(self.result()["release"], RELEASE)
        self.assertFalse((self.queue / (RELEASE + ".zip")).exists())

    def test_partial_upload_is_ignored(self):
        (self.queue / "upload.part").write_text("partial upload")
        self.worker.process_queue(self.root)
        self.assertFalse((self.root / "tmp/restart.txt").exists())

    def test_bad_hash_does_not_touch_application(self):
        self.bundle(bad_hash=True)
        self.worker.process_queue(self.root)
        self.assertEqual(self.result()["status"], "failed")
        self.assertEqual((self.root / "server.js").read_text(), "old server")
        self.assertFalse((self.root / "tmp/restart.txt").exists())

    def test_unsafe_paths_and_hosting_config_are_rejected_before_any_write(self):
        for name in [
            "../escape",
            "/absolute",
            ".env.local",
            "public/.env",
            "tmp/restart.txt",
            "public/.htaccess",
        ]:
            with self.subTest(name=name):
                self.bundle({name: "bad"})
                self.worker.process_queue(self.root)
                self.assertEqual(self.result()["status"], "failed")
                self.assertEqual((self.root / "server.js").read_text(), "old server")
                self.assertFalse((self.root / "tmp/restart.txt").exists())

    def test_symlink_in_destination_is_rejected(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (self.root / "public").symlink_to(outside, target_is_directory=True)
        self.bundle()
        self.worker.process_queue(self.root)
        self.assertEqual(self.result()["status"], "failed")
        self.assertFalse((outside / "a.txt").exists())
        self.assertEqual((self.root / "server.js").read_text(), "old server")

    def test_processed_request_is_not_repeated(self):
        self.bundle()
        self.worker.process_queue(self.root)
        restart = self.root / "tmp/restart.txt"
        before = restart.stat().st_mtime_ns
        self.worker.process_queue(self.root)
        self.assertEqual(restart.stat().st_mtime_ns, before)

    def test_queue_denies_http_access_and_has_heartbeat(self):
        self.assertIn("Require all denied", (self.queue / ".htaccess").read_text())
        self.assertEqual(
            json.loads((self.queue / "worker.json").read_text())["protocol"], 1
        )


if __name__ == "__main__":
    unittest.main()
