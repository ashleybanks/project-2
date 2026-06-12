use serde_json::json;
use typst_compiler::{compile, render};

fn spike_payload() -> serde_json::Value {
    json!({
        "customer": { "name": "Acme Corp" },
        "invoice": {
            "number": "INV-2026-001",
            "status": "paid",
            "items": [
                { "description": "Consulting (10h)", "unit_price": 1500.00 },
                { "description": "Expenses",          "unit_price": 87.50  }
            ]
        }
    })
}

#[test]
fn end_to_end_render_produces_pdf() {
    let model = typst_compiler::model::spike_model();
    let source = compile(&model, None);

    println!("=== Compiled Typst source ===\n{source}\n============================");

    let payload = spike_payload();
    let pdf_bytes = render(&source, &payload).expect("render should succeed");

    assert!(pdf_bytes.len() > 1024, "PDF is suspiciously small: {} bytes", pdf_bytes.len());

    // PDF magic bytes
    assert!(pdf_bytes.starts_with(b"%PDF-"), "output is not a PDF");

    // Write to /tmp for manual inspection
    std::fs::write("/tmp/spike-output.pdf", &pdf_bytes).unwrap();
    println!("PDF written to /tmp/spike-output.pdf ({} bytes)", pdf_bytes.len());
}
