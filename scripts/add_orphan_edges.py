import json
import sys

GRAPH_PATH = 'C:/업무/eum_platform/.understand-anything/knowledge-graph.json'
ASSEMBLED_PATH = 'C:/업무/eum_platform/.understand-anything/intermediate/assembled-graph.json'

with open(GRAPH_PATH, 'r', encoding='utf-8') as f:
    graph = json.load(f)

nodes = graph.get('nodes', [])
edges = graph.get('edges', [])

# Build sets
node_ids = {n['id'] for n in nodes}
connected = set()
for e in edges:
    connected.add(e.get('source'))
    connected.add(e.get('target'))

orphans_before = [n for n in nodes if n['id'] not in connected]
print(f"Orphan count before: {len(orphans_before)}")

new_edges = []

def add_edge(source, target, etype, weight=0.6):
    if source in node_ids and target in node_ids:
        new_edges.append({
            "source": source,
            "target": target,
            "type": etype,
            "direction": "forward",
            "weight": weight
        })
        return True
    else:
        missing = []
        if source not in node_ids:
            missing.append(f"source={source}")
        if target not in node_ids:
            missing.append(f"target={target}")
        print(f"  SKIP (missing): {', '.join(missing)}")
        return False

# ─── 1. Migration SQL orphans ─────────────────────────────────────────────
# These are incremental migration files that depend on the initial schema
migration_orphans = [
    "table:supabase/migrations/002_rpc.sql",
    "table:supabase/migrations/003_quality_rpc.sql",
    "table:supabase/migrations/004_fix_rls_jwt_claims.sql",
    "table:supabase/migrations/005_seed_gold_data.sql",
    "table:supabase/migrations/007_fix_migration_calc.sql",
    "table:supabase/migrations/008_gold_business.sql",
    "table:supabase/migrations/009_real_facilities.sql",
    "table:supabase/migrations/013_access_logs_response_ms.sql",
    "table:supabase/migrations/014_search.sql",
    "table:supabase/migrations/018_collection_pagination.sql",
    "table:supabase/migrations/020_tenant_status.sql",
    "table:supabase/migrations/021_admin_enhancements.sql",
    "table:supabase/migrations/025_ontology_schema_upgrade.sql",
    "table:supabase/migrations/026_collection_connector_config.sql",
    "table:supabase/migrations/027_embeddings.sql",
    "table:supabase/migrations/030_ontology_workspace.sql",
    "table:supabase/migrations/031_nl_to_sql.sql",
    "table:supabase/migrations/032_quality_duplicate_rpc.sql",
    "table:supabase/migrations/035_catalog_fts.sql",
]

anchor_001 = "table:supabase/migrations/001_initial.sql"
config_toml = "config:supabase/config.toml"

for mig_id in migration_orphans:
    add_edge(mig_id, anchor_001, "depends-on", 0.7)
    add_edge(config_toml, mig_id, "configures", 0.6)

# ─── 2. table:supabase/seed.sql:usage_log ────────────────────────────────
add_edge(config_toml, "table:supabase/seed.sql:usage_log", "configures", 0.6)
add_edge("table:supabase/seed.sql:usage_log",
         "table:supabase/migrations/001_initial.sql:usage_log", "related", 0.6)

# ─── 3. config:.mcp.json ─────────────────────────────────────────────────
add_edge("config:.mcp.json", "file:next.config.js", "configures", 0.6)
add_edge("config:.mcp.json", "config:package.json", "configures", 0.6)

# ─── 4. Top-level HTML files ─────────────────────────────────────────────
add_edge("file:kimi.html", "document:README.md", "references", 0.5)
add_edge("file:status.html", "document:README.md", "references", 0.5)
add_edge("file:status.html.bak", "file:status.html", "related", 0.5)

# ─── 5. .superpowers/brainstorm/* files ──────────────────────────────────
plan_doc = "document:docs/superpowers/plans/2026-06-12-platform-quality-upgrade.md"
add_edge("file:.superpowers/brainstorm/158831-1781786731/content/approach.html",
         plan_doc, "references", 0.5)
add_edge("file:.superpowers/brainstorm/158831-1781786731/content/mockup-01-scenario-selector.html",
         plan_doc, "references", 0.5)
add_edge("file:.superpowers/brainstorm/158831-1781786731/content/scenarios.html",
         plan_doc, "references", 0.5)
# State files tie to the brainstorm content
approach_html = "file:.superpowers/brainstorm/158831-1781786731/content/approach.html"
add_edge("file:.superpowers/brainstorm/158753-1781786695/state/server.pid",
         approach_html, "related", 0.5)
add_edge("file:.superpowers/brainstorm/158831-1781786731/state/server-stopped",
         approach_html, "related", 0.5)
add_edge("file:.superpowers/brainstorm/158831-1781786731/state/server.pid",
         approach_html, "related", 0.5)

# ─── 6. config:data/samples/*.json ───────────────────────────────────────
load_script = "file:scripts/load-samples-to-catalog.mjs"
data_samples = [
    "config:data/samples/air_quality.json",
    "config:data/samples/business.json",
    "config:data/samples/commercial_area.json",
    "config:data/samples/cultural_facility.json",
    "config:data/samples/fire_safety.json",
    "config:data/samples/housing_stock.json",
    "config:data/samples/public_facility.json",
    "config:data/samples/public_hospital.json",
    "config:data/samples/public_transport.json",
    "config:data/samples/school_population.json",
    "config:data/samples/sports_facility.json",
    "config:data/samples/tourism.json",
    "config:data/samples/traffic_accidents.json",
    "config:data/samples/water_quality.json",
    "config:data/samples/welfare_facility.json",
    "config:data/samples/youth_population.json",
]
for ds in data_samples:
    add_edge(load_script, ds, "uses", 0.7)
add_edge(load_script, "file:app/api/catalog/route.ts", "uses", 0.6)

# ─── 7. E2E test files ────────────────────────────────────────────────────
global_setup = "file:__tests__/e2e/global-setup.ts"
helpers_auth = "file:__tests__/e2e/helpers/auth.ts"
add_edge("file:__tests__/e2e/login.spec.ts", helpers_auth, "imports", 0.7)
add_edge("file:__tests__/e2e/login.spec.ts", global_setup, "depends-on", 0.6)
add_edge("file:__tests__/e2e/smoke.spec.ts", helpers_auth, "imports", 0.7)
add_edge("file:__tests__/e2e/smoke.spec.ts", global_setup, "depends-on", 0.6)

# ─── 8. __tests__/lib/map-samples.test.ts ────────────────────────────────
add_edge("file:__tests__/lib/map-samples.test.ts",
         "file:app/api/catalog/[id]/download/route.ts", "tests", 0.7)
add_edge("file:__tests__/lib/map-samples.test.ts",
         "file:lib/supabase/client.ts", "imports", 0.6)

# ─── 9. .understand-anything/.understandignore ───────────────────────────
add_edge("config:.understand-anything/config.json",
         "file:.understand-anything/.understandignore", "configures", 0.6)

# ─── 10. config:.understand-anything/config.json ─────────────────────────
add_edge("config:.understand-anything/config.json",
         "config:package.json", "configures", 0.6)

# ─── 11. app/loading.tsx and app/not-found.tsx ───────────────────────────
add_edge("file:app/layout.tsx", "file:app/loading.tsx", "contains", 0.7)
add_edge("file:app/layout.tsx", "file:app/not-found.tsx", "contains", 0.7)

# ─── 12. config:data/geo/sigun_centroids.json ────────────────────────────
# Find geo-related lib files
geo_lib = "file:lib/geo-cluster.ts"
heatmap_lib = "file:lib/heatmap.ts"
add_edge(geo_lib, "config:data/geo/sigun_centroids.json", "uses", 0.7)
add_edge(heatmap_lib, "config:data/geo/sigun_centroids.json", "uses", 0.6)

# ─── 13. Document orphans ─────────────────────────────────────────────────
backlog_doc = "document:docs/backlog/phase-backlog.md"
upgrade_plan = "document:docs/superpowers/plans/2026-06-12-platform-quality-upgrade.md"
migration_plan = "document:docs/superpowers/plans/2026-06-10-nextjs-supabase-migration.md"
submission_guide = "document:docs/user-guide/agency-submission.md"
review_guide = "document:docs/user-guide/center-review.md"
workflow_doc = "document:docs/specs/2026-06-08-공급자워크플로우-design.md"
readme = "document:README.md"

add_edge(backlog_doc, migration_plan, "related", 0.6)
add_edge(upgrade_plan, backlog_doc, "related", 0.6)
add_edge(submission_guide, workflow_doc, "references", 0.7)
add_edge(review_guide, workflow_doc, "references", 0.7)
add_edge(submission_guide, readme, "references", 0.6)
add_edge(review_guide, readme, "references", 0.6)

# ─── 14. lib/connectors/index.ts ─────────────────────────────────────────
add_edge("file:lib/connectors/index.ts", "file:lib/connectors/types.ts", "imports", 0.8)
add_edge("file:lib/connectors/index.ts", "file:lib/connectors/client.ts", "imports", 0.7)
add_edge("file:lib/connectors/index.ts", "file:lib/connectors/api.ts", "imports", 0.7)

# ─── 15. next-env.d.ts ───────────────────────────────────────────────────
add_edge("file:next-env.d.ts", "file:next.config.js", "references", 0.7)
# Try tsconfig
tsconfig_id = "file:tsconfig.json"
if tsconfig_id in node_ids:
    add_edge("file:next-env.d.ts", tsconfig_id, "references", 0.6)

# ─── 16. postcss.config.js ───────────────────────────────────────────────
add_edge("file:postcss.config.js", "file:tailwind.config.ts", "configures", 0.7)
add_edge("file:postcss.config.js", "config:package.json", "configures", 0.6)

# ─── 17. run_seed_and_user.mjs ───────────────────────────────────────────
add_edge("file:run_seed_and_user.mjs", "file:scripts/e2e-seed.mjs", "calls", 0.7)
add_edge("file:run_seed_and_user.mjs", "file:lib/supabase/client.ts", "imports", 0.6)

# ─── 18. run.vbs ─────────────────────────────────────────────────────────
add_edge("file:run.vbs", "config:package.json", "references", 0.5)

# ─── 19. scripts/* orphans ───────────────────────────────────────────────
add_edge("file:scripts/agent-status.ps1", "file:scripts/agent-status.py", "related", 0.6)

add_edge("file:scripts/create_test_users.py", "file:lib/supabase/client.ts", "uses", 0.6)
add_edge("file:scripts/create_test_users.py", "file:scripts/e2e-seed.mjs", "related", 0.6)

add_edge("file:scripts/e2e-seed.mjs", "file:lib/supabase/client.ts", "imports", 0.7)
add_edge("file:scripts/e2e-seed.mjs", "file:scripts/create_test_users.py", "related", 0.6)
add_edge("file:scripts/e2e-seed.mjs", "file:__tests__/e2e/global-setup.ts", "uses", 0.6)

add_edge("file:scripts/inspect-routes.mjs", "file:next.config.js", "uses", 0.6)
add_edge("file:scripts/inspect-routes.mjs", "file:app/api/catalog/route.ts", "references", 0.5)

add_edge("file:scripts/quality_report.py", "file:lib/supabase/client.ts", "uses", 0.6)

add_edge("file:scripts/reset_test_passwords.mjs", "file:lib/supabase/client.ts", "imports", 0.7)
add_edge("file:scripts/reset_test_passwords.mjs", "file:scripts/create_test_users.py", "related", 0.6)

# ─── 20. test-results/.last-run.json ─────────────────────────────────────
add_edge("config:test-results/.last-run.json", "file:playwright.config.ts", "related", 0.5)
jest_config_id = "file:jest.config.js"
if jest_config_id in node_ids:
    add_edge("config:test-results/.last-run.json", jest_config_id, "related", 0.5)

# ─── Deduplicate new edges ────────────────────────────────────────────────
existing_edge_keys = {
    (e['source'], e['target'], e['type']) for e in edges
}
unique_new_edges = [
    e for e in new_edges
    if (e['source'], e['target'], e['type']) not in existing_edge_keys
]

print(f"\nNew edges generated: {len(new_edges)}")
print(f"Unique (not already in graph): {len(unique_new_edges)}")

# Apply edges
graph['edges'] = edges + unique_new_edges

# Verify: recount orphans
all_connected = set()
for e in graph['edges']:
    all_connected.add(e.get('source'))
    all_connected.add(e.get('target'))

orphans_after = [n for n in nodes if n['id'] not in all_connected]
print(f"Orphan count after: {len(orphans_after)}")
if orphans_after:
    print("Remaining orphans:")
    for n in orphans_after:
        print(f"  {n['id']} | type={n['type']}")

# Write updated graph
with open(GRAPH_PATH, 'w', encoding='utf-8') as f:
    json.dump(graph, f, ensure_ascii=False, indent=2)
print(f"\nWritten to: {GRAPH_PATH}")

with open(ASSEMBLED_PATH, 'w', encoding='utf-8') as f:
    json.dump(graph, f, ensure_ascii=False, indent=2)
print(f"Written to: {ASSEMBLED_PATH}")

print(f"\nFinal edge count: {len(graph['edges'])}")
print(f"Recovered: {len(orphans_before) - len(orphans_after)} orphan nodes")
print(f"Remaining orphans: {len(orphans_after)}")
