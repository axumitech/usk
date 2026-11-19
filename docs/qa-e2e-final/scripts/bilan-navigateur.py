"""Indexe les preuves navigateur par scénario sans additionner les replays."""

import json
import re
from collections import Counter
from pathlib import Path


proofs = Path(__file__).resolve().parents[1] / "preuves"
rows = {}


def read(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def record(key, status, source, version):
    if status not in {"VALIDÉ", "ÉCHEC", "BLOQUÉ"}:
        raise ValueError(f"Statut inattendu {status} dans {source.name}")
    rows[key] = {
        "statut": status,
        "preuve": source.relative_to(proofs).as_posix(),
        "revision": version,
    }


for folder in sorted(proofs.iterdir(), key=lambda item: item.name):
    if not folder.is_dir() or not re.search(r"-\d{4}-\d{2}-\d{2}T", folder.name):
        continue
    suite = re.split(r"-\d{4}-\d{2}-\d{2}T", folder.name, maxsplit=1)[0]
    version_file = folder / "version.json"
    version = read(version_file)["revision"] if version_file.exists() else None
    resume = folder / "resume.json"
    matrix = folder / "matrice.json"
    if resume.exists():
        result = read(resume)
        version = (result.get("version") or {}).get("revision", version)
        events = result.get("rows", result.get("results", []))
        if events and suite != "portails":
            rows.pop("INTERRUPTION " + suite, None)
        for event in events:
            key = event.get("id") or "ÉTUDIANT " + event["section"]
            if key in {suite, "DOC-BLOCK"}:
                record("INTERRUPTION " + suite, event["status"], resume, version)
                continue
            if suite == "absence-piece":
                key = "PIÈCE " + key
            record(key, event["status"], resume, version)
    if matrix.exists():
        result = read(matrix)
        if isinstance(result, list):
            for event in result:
                if suite == "roles":
                    record("RÔLE " + event["role"], event["status"], matrix, version)
                elif event.get("id") and event.get("state") in {"VALIDÉ", "ÉCHEC", "BLOQUÉ"}:
                    record(event["id"], event["state"], matrix, version)
        elif suite in {"groupes", "maquette"}:
            record(suite.upper(), result["status"], matrix, result["version"]["revision"])
    if suite == "pwa" and (folder / "trace.json").exists():
        trace = read(folder / "trace.json")
        ok = trace.get("assetHashMatch") and trace.get("scriptHttp") == 200 and trace.get("offlineFallback")
        record("PWA hors ligne", "VALIDÉ" if ok else "ÉCHEC", folder / "trace.json", version)
    elif suite == "pwa" and (folder / "incident.json").exists():
        record("PWA hors ligne", "BLOQUÉ", folder / "incident.json", version)
    if suite == "enseignement" and (folder / "trace.json").exists():
        trace = read(folder / "trace.json")
        for check in trace["checks"]:
            record("ENS " + check["name"], "VALIDÉ", folder / "trace.json", version)
        record("ENS parcours complet", "BLOQUÉ" if trace.get("error") else "VALIDÉ", folder / "trace.json", version)
    if suite == "structure" and (folder / "structure.json").exists():
        trace = read(folder / "structure.json")
        for action in trace["actions"]:
            record("STRUCTURE " + action, "VALIDÉ", folder / "structure.json", trace["version"]["revision"])
        record("STRUCTURE parcours complet", "BLOQUÉ" if trace.get("error") else "VALIDÉ", folder / "structure.json", trace["version"]["revision"])
    if suite == "navigation" and (folder / "navigation.json").exists():
        trace = read(folder / "navigation.json")
        for page in trace["pages"]:
            record("MENU " + page["route"], "VALIDÉ" if page["ok"] else "ÉCHEC", folder / "navigation.json", trace["version"]["revision"])

suites = {}
for row in rows.values():
    suite = re.split(r"-\d{4}-\d{2}-\d{2}T", row["preuve"], maxsplit=1)[0]
    suites.setdefault(suite, Counter())[row["statut"]] += 1

def suite_status(counts):
    if counts["ÉCHEC"]:
        return "ÉCHEC"
    if counts["BLOQUÉ"]:
        return "BLOQUÉ"
    return "VALIDÉ"

summary = {
    "unite": "Dernier verdict enregistré de chaque contrôle nommé. Les destinations du menu sont des consultations HTTP dans Chrome. Les contrôles prévus mais jamais atteints figurent dans les fiches.",
    "totaux": dict(Counter(row["statut"] for row in rows.values())),
    "par_parcours": {suite: {"verdict": suite_status(counts), "controles": counts} for suite, counts in sorted(suites.items())},
    "controles": dict(sorted(rows.items())),
}
output = proofs / "bilan-navigateur.json"
output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary["totaux"], ensure_ascii=False))
