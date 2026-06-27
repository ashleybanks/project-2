use serde_json::json;
use typst_compiler::frontend_model::{map_to_block_model, FrontendTopLevel};
use typst_compiler::render_svg_with_fonts_and_positions;

#[test]
fn field_intent_positions_resolve_via_introspector() {
    let json = r#"[
      {"_type":"block","style":"normal","children":[
        {"_type":"span","text":"Invoice for "},
        {"_type":"fieldIntent","label":"Customer name","field_path":"customer.name"},
        {"_type":"span","text":", ref "},
        {"_type":"fieldIntent","label":"Invoice number","field_path":"invoice.number"}
      ]}
    ]"#;

    let blocks: Vec<FrontendTopLevel> = serde_json::from_str(json).unwrap();
    let model = map_to_block_model(blocks);
    let source = typst_compiler::compile(&model, None, true);

    assert!(source.contains("key: \"fi-0\""), "expected fi-0 key in source:\n{source}");
    assert!(source.contains("key: \"fi-1\""), "expected fi-1 key in source:\n{source}");

    let payload = json!({
        "customer": { "name": "Acme Corp" },
        "invoice": { "number": "INV-2026-001" }
    });

    let (pages, positions) = render_svg_with_fonts_and_positions(&source, &payload, &[])
        .expect("render should succeed");

    assert_eq!(pages.len(), 1, "expected a single page");
    assert!(pages[0].starts_with("<svg"), "expected valid SVG output");

    assert_eq!(positions.len(), 2, "expected one position per field intent, got: {positions:?}");

    let fi0 = positions.iter().find(|p| p.key == "fi-0").expect("fi-0 position missing");
    let fi1 = positions.iter().find(|p| p.key == "fi-1").expect("fi-1 position missing");

    assert_eq!(fi0.page, 1);
    assert_eq!(fi1.page, 1);

    // fi-1 (ref number) comes later in the same line of text, so it should be
    // positioned to the right of fi-0 (customer name) on the same page.
    assert!(fi1.x_pt > fi0.x_pt, "expected fi-1 to be right of fi-0: {fi0:?} vs {fi1:?}");

    // Both fields should have a non-trivial measured size (single-line values).
    assert!(fi0.w_pt > 0.0 && fi0.h_pt > 0.0, "expected fi-0 to have a real size: {fi0:?}");
    assert!(fi1.w_pt > 0.0 && fi1.h_pt > 0.0, "expected fi-1 to have a real size: {fi1:?}");
}
