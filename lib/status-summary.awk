# Read saved text only. It is advisory, never validation or completion evidence.
function trim(text) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", text)
    return text
}
function clean(text) {
    gsub(/[[:cntrl:]]/, "", text)
    sub(/^[-*+] +/, "", text)
    sub(/^\[[ xX]\] +/, "", text)
    gsub(/\*\*/, "", text)
    return trim(text)
}
function field(name) {
    name = tolower(trim(name))
    if (name == "goal" || name == "request" || name == "request / outcome" || name == "request / agreed outcome") return "goal"
    if (name == "finished" || name == "finished (recorded)") return "finished"
    if (name == "still not done") return "pending"
    if (name == "blocker") return "blocker"
    if (name == "next" || name == "next action" || name == "next action / blocker") return "next"
    return ""
}
function placeholder(text, lower) {
    lower = tolower(text)
    return text == "" || lower ~ /^(unknown|tbd|todo|n\/a|none yet\.?|no work assessed yet\.?)$/ ||
        lower ~ /^none recorded yet[.;]/ || text ~ /^<[^>]*>$/
}
function count(source, key) {
    if (++seen[source, key] > 1) ambiguous[source, key] = 1
}
function add(source, key, text) {
    text = clean(text)
    if (placeholder(text)) return
    # Bound stored and printed values; no terminal controls or multiline output.
    if (value[source, key] != "") text = value[source, key] "; " text
    value[source, key] = substr(text, 1, 240)
}
function selected(key) {
    if (ambiguous[1, "goal"] || ambiguous[1, key]) return "unknown"
    if (value[1, key] != "") return value[1, key]
    if (ambiguous[2, "goal"] || ambiguous[2, key] || value[2, key] == "") return "unknown"
    return value[2, key]
}
FNR == 1 { section = ""; fenced = 0 }
{
    source = (FILENAME == statefile ? 1 : 2)
    line = $0
    gsub(/[[:cntrl:]]/, "", line)
    if (line ~ /^[[:space:]]*(```|~~~)/) { fenced = !fenced; next }
    if (fenced) next
    if (line ~ /^#+[[:space:]]/) {
        sub(/^#+[[:space:]]+/, "", line)
        sub(/[[:space:]]+#+[[:space:]]*$/, "", line)
        heading = tolower(clean(line))
        section = field(heading)
        if (section != "") count(source, section)
        else if (heading == "current run" || heading == "agreed scope") {
            section = "scope"
            if (++scope_count[source, heading] > 1) {
                ambiguous[source, "goal"] = 1
                ambiguous[source, "blocker"] = 1
                ambiguous[source, "next"] = 1
            }
        } else section = "ignore"
        next
    }
    line = clean(line)
    if (line == "" || line ~ /^[>|]/) next
    if (section == "scope" || section == "") {
        colon = index(line, ":")
        if (!colon) next
        key = field(substr(line, 1, colon - 1))
        if (key != "") {
            count(source, key)
            add(source, key, substr(line, colon + 1))
        }
    } else if (section != "ignore") add(source, section, line)
}
END {
    conflict = !ambiguous[1, "goal"] && !ambiguous[2, "goal"] &&
        value[1, "goal"] != "" && value[2, "goal"] != "" && value[1, "goal"] != value[2, "goal"]
    print "Goal: " (conflict ? "unknown" : selected("goal"))
    print "Finished (recorded): " (conflict ? "unknown" : selected("finished"))
    print "Still not done: " (conflict ? "unknown" : selected("pending"))
    print "Blocker: " (conflict ? "unknown" : selected("blocker"))
    print "Next: " (conflict ? "Reconcile conflicting saved goals" : selected("next"))
}
