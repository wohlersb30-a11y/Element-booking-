#!/usr/bin/env python3
"""One-off import of the legacy customer CSVs into public.customers.

Merges the two Element exports, dedupes by phone (falling back to email), and
bulk-inserts via the Supabase Management API SQL endpoint. Requires SUPA_TOKEN
in the environment (the same PAT stored in the macOS keychain).

Run:  SUPA_TOKEN=$(security find-generic-password -s "Supabase CLI" -w) \
        python3 scripts/import-customers.py
"""
import csv, json, os, re, sys, subprocess

PROJECT = "vffdlrtqavrviyiamfun"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
TOKEN = os.environ["SUPA_TOKEN"]
BASE = os.path.join(os.path.dirname(__file__), "..", "Customer Database")

FILES = [
    ("GolfBooking Management Portal  Element Indoor Golf.csv", "portal"),
    ("element_contacts_CLEAN.csv", "contacts"),
]


def norm_phone(raw):
    d = re.sub(r"\D", "", raw or "")
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]          # drop US country code
    return d or None


def clean(s):
    s = (s or "").strip()
    return s or None


def better_name(a, b):
    """Prefer a non-empty, properly-cased name over blank/ALL-CAPS."""
    if not a:
        return b
    if not b:
        return a
    if a.isupper() and not b.isupper():
        return b
    return a


records = {}          # dedupe key -> record dict
anon = []             # rows with neither phone nor email (kept as-is)

for fname, src in FILES:
    path = os.path.join(BASE, fname)
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            name = clean(row.get("Full Name"))
            email = clean(row.get("Email Address"))
            email = email.lower() if email else None
            phone = norm_phone(row.get("Phone Number"))
            key = phone or email
            if not key:
                if name:
                    anon.append({"full_name": name, "email": None,
                                 "phone": None, "source": src})
                continue
            if key in records:
                r = records[key]
                r["full_name"] = better_name(r["full_name"], name)
                r["email"] = r["email"] or email
                r["phone"] = r["phone"] or phone
                if src not in r["source"].split("+"):
                    r["source"] += "+" + src
            else:
                records[key] = {"full_name": name, "email": email,
                                "phone": phone, "source": src}

rows = list(records.values()) + anon
print(f"Deduped to {len(rows)} customers "
      f"({len(records)} keyed, {len(anon)} name-only).")


def q(v):
    if v is None:
        return "null"
    return "'" + v.replace("'", "''") + "'"


def run_sql(sql):
    payload = json.dumps({"query": sql})
    proc = subprocess.run(
        ["curl", "-s", "--fail-with-body", URL,
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "-d", "@-"],
        input=payload, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"curl failed: {proc.stdout} {proc.stderr}")
    return proc.stdout


if "--dry-run" in sys.argv:
    print("Dry run — not inserting. Sample:", rows[:3])
    sys.exit(0)

BATCH = 1000
inserted = 0
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i + BATCH]
    values = ",".join(
        f"({q(r['full_name'])},{q(r['email'])},{q(r['phone'])},{q(r['source'])})"
        for r in chunk)
    sql = ("insert into public.customers (full_name,email,phone,source) values "
           + values + ";")
    run_sql(sql)
    inserted += len(chunk)
    print(f"  inserted {inserted}/{len(rows)}")

print("Done.")
