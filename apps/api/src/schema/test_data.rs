use rand::Rng;
use serde_json::{json, Value};

/// Generate `count` fake records conforming to the given JSON Schema.
pub fn generate_records(schema: &Value, count: usize) -> Vec<Value> {
    let mut rng = rand::thread_rng();
    (0..count).map(|i| generate_value(schema, "", i, &mut rng)).collect()
}

fn generate_value(schema: &Value, field_name: &str, index: usize, rng: &mut impl Rng) -> Value {
    let schema_type = schema.get("type").and_then(|v| v.as_str()).unwrap_or("string");

    // Handle enum values directly
    if let Some(enum_vals) = schema.get("enum").and_then(|v| v.as_array()) {
        if !enum_vals.is_empty() {
            return enum_vals[index % enum_vals.len()].clone();
        }
    }

    match schema_type {
        "object" => generate_object(schema, index, rng),
        "array" => generate_array(schema, field_name, index, rng),
        "number" => generate_number(field_name, rng),
        "integer" => json!(rng.gen_range(1_i64..=100)),
        "boolean" => json!(index % 2 == 0),
        "null" => Value::Null,
        _ => generate_string(schema, field_name, index, rng),
    }
}

fn generate_object(schema: &Value, index: usize, rng: &mut impl Rng) -> Value {
    let mut obj = serde_json::Map::new();
    if let Some(props) = schema.get("properties").and_then(|v| v.as_object()) {
        for (key, prop_schema) in props {
            obj.insert(key.clone(), generate_value(prop_schema, key, index, rng));
        }
    }
    Value::Object(obj)
}

fn generate_array(schema: &Value, field_name: &str, index: usize, rng: &mut impl Rng) -> Value {
    let items_schema = schema.get("items").unwrap_or(&Value::Null);
    let count = rng.gen_range(1_usize..=3);
    let items: Vec<Value> = (0..count)
        .map(|i| generate_value(items_schema, field_name, index * 10 + i, rng))
        .collect();
    Value::Array(items)
}

fn generate_number(field_name: &str, rng: &mut impl Rng) -> Value {
    let name = field_name.to_lowercase();
    let val: f64 = if name.contains("price") || name.contains("amount") || name.contains("total") || name.contains("cost") {
        (rng.gen_range(10_u32..=5000) as f64) + 0.99
    } else if name.contains("rate") || name.contains("percent") {
        rng.gen_range(1_u32..=100) as f64
    } else if name.contains("qty") || name.contains("quantity") {
        rng.gen_range(1_u32..=20) as f64
    } else {
        rng.gen_range(1_u32..=1000) as f64
    };
    // Round to 2 decimal places
    json!((val * 100.0).round() / 100.0)
}

fn generate_string(schema: &Value, field_name: &str, index: usize, rng: &mut impl Rng) -> Value {
    let name = field_name.to_lowercase();
    let fmt = schema.get("format").and_then(|v| v.as_str()).unwrap_or("");

    // Format-based generation
    if fmt == "date" || fmt == "date-time" {
        let days_offset = (index * 3) as i64;
        let base = chrono::Utc::now() - chrono::Duration::days(days_offset);
        return json!(base.format("%Y-%m-%d").to_string());
    }
    if fmt == "email" {
        let users = ["alice", "bob", "carol", "david", "eve"];
        return json!(format!("{}@example.com", users[index % users.len()]));
    }
    if fmt == "uri" {
        return json!(format!("https://example.com/{index}"));
    }

    // Field-name heuristics
    let first_names = ["Jane", "Acme Corp Ltd", "David", "Sarah", "Tech Solutions Inc", "Robert", "Emma"];
    let last_names  = ["Smith", "Johnson", "Williams", "Jones", "Brown"];
    let companies   = ["Acme Corp", "Globex", "Initech", "Umbrella Ltd", "Stark Industries"];
    let cities      = ["London", "Manchester", "Bristol", "Edinburgh", "Leeds"];
    let statuses    = ["active", "pending", "complete", "draft", "sent"];
    let descriptions = [
        "Professional consulting services",
        "Software licence (annual)",
        "Design and implementation",
        "Monthly retainer",
        "Ad hoc support",
    ];

    if name.contains("full_name") || (name.contains("name") && !name.contains("company") && !name.contains("org")) {
        let fi = first_names[index % first_names.len()];
        let la = last_names[index % last_names.len()];
        return json!(format!("{fi} {la}"));
    }
    if name.contains("company") || name.contains("org") || name.contains("client") {
        return json!(companies[index % companies.len()]);
    }
    if name == "name" || name.ends_with(".name") {
        return json!(first_names[index % first_names.len()]);
    }
    if name.contains("email") {
        let users = ["alice", "bob", "carol", "david", "eve"];
        return json!(format!("{}@example.com", users[index % users.len()]));
    }
    if name.contains("phone") || name.contains("tel") {
        let _ = rng;
        return json!(format!("+44 7700 9{:05}", index * 137 % 100000));
    }
    if name.contains("address") {
        return json!(format!("{} High Street, {}", (index + 1) * 10, cities[index % cities.len()]));
    }
    if name.contains("city") || name.contains("town") {
        return json!(cities[index % cities.len()]);
    }
    if name.contains("date") || name.contains("_at") || name.ends_with("_date") {
        let days_offset = (index * 3) as i64;
        let base = chrono::Utc::now() - chrono::Duration::days(days_offset);
        return json!(base.format("%Y-%m-%d").to_string());
    }
    if name.contains("status") || name.contains("state") {
        return json!(statuses[index % statuses.len()]);
    }
    if name.contains("description") || name.contains("desc") || name.contains("notes") {
        return json!(descriptions[index % descriptions.len()]);
    }
    if name.contains("reference") || name.contains("number") || name.contains("num") || name.contains("id") {
        return json!(format!("REF-{:04}", 1000 + index));
    }
    if name.contains("currency") || name.contains("code") {
        return json!("GBP");
    }

    // Fallback: generate a plausible short string
    let words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    json!(format!("{}-{}", words[index % words.len()], index + 1))
}
