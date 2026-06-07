use typst_compiler::render;

#[test]
fn minimal_hello_world() {
    let source = "Hello, World!";
    let payload = serde_json::json!({});
    let bytes = render(source, &payload).expect("minimal render failed");
    println!("Minimal PDF: {} bytes", bytes.len());
    std::fs::write("/tmp/minimal.pdf", &bytes).unwrap();
    assert!(bytes.starts_with(b"%PDF-"), "not a PDF");
    assert!(bytes.len() > 2123, "minimal content should exceed blank-page size, got {} bytes", bytes.len());
}

#[test]
fn with_data_reference() {
    let source = r#"#let data = json("data.json")
Hello #data.name!"#;
    let payload = serde_json::json!({ "name": "Ashley" });
    let bytes = render(source, &payload).expect("data reference render failed");
    println!("Data reference PDF: {} bytes", bytes.len());
    std::fs::write("/tmp/data_ref.pdf", &bytes).unwrap();
    assert!(bytes.len() > 2123, "should have content, got {} bytes", bytes.len());
}

#[test]
fn font_loading_check() {
    let font_count = typst_assets::fonts().count();
    println!("typst_assets::fonts() count: {font_count}");
    assert!(font_count > 0, "no fonts in typst-assets");

    use typst::foundations::Bytes;
    use typst::text::Font;

    let mut loaded = 0usize;
    for data in typst_assets::fonts() {
        let bytes = Bytes::new(data.to_vec());
        for font in Font::iter(bytes) {
            println!("  font: {}", font.info().family);
            loaded += 1;
        }
    }
    println!("Total fonts loaded: {loaded}");
    assert!(loaded > 0, "Font::iter produced no fonts");
}
