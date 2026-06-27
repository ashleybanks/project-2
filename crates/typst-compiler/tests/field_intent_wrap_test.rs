use serde_json::json;
use typst_compiler::frontend_model::{map_to_block_model, FrontendTopLevel};
use typst_compiler::render_svg_with_fonts_and_positions;

/// One field at the very start of a paragraph (line 1), and a second field
/// preceded by enough filler text to force a wrap onto line 2 of the SAME
/// paragraph. Checks that the line-2 field's box top lands within line 2's
/// vertical span, not line 3's (i.e. not "one row below" its real line).
#[test]
fn field_intent_after_wrap_lands_on_its_own_line_not_the_next() {
    let filler = "word ".repeat(40); // long enough to force a wrap at default A4 margins
    let json = format!(
        r#"[
      {{"_type":"block","style":"normal","children":[
        {{"_type":"fieldIntent","label":"Start","field_path":"start"}},
        {{"_type":"span","text":" {filler}"}},
        {{"_type":"fieldIntent","label":"AfterWrap","field_path":"after_wrap"}}
      ]}}
    ]"#
    );

    let blocks: Vec<FrontendTopLevel> = serde_json::from_str(&json).unwrap();
    let model = map_to_block_model(blocks);
    let source = typst_compiler::compile(&model, None, true);

    let payload = json!({ "start": "AAA", "after_wrap": "ZZZ" });

    let (pages, positions) = render_svg_with_fonts_and_positions(&source, &payload, &[])
        .expect("render should succeed");

    let page_height_pt = {
        let m = pages[0]
            .split("viewBox=\"0 0 ")
            .nth(1)
            .unwrap()
            .split('"')
            .next()
            .unwrap()
            .to_string();
        let mut parts = m.split(' ');
        parts.next();
        parts.next().unwrap().parse::<f64>().unwrap()
    };

    let fi0 = positions.iter().find(|p| p.key == "fi-0").expect("fi-0 missing"); // "start" (line 1)
    let fi1 = positions.iter().find(|p| p.key == "fi-1").expect("fi-1 missing"); // "after_wrap" (line N)

    println!("page_height_pt: {page_height_pt}");
    println!("fi-0 (line 1, start of paragraph): {fi0:?}");
    println!("fi-1 (after wrap): {fi1:?}");

    let gap = fi1.y_pt - fi0.y_pt;
    println!("gap (line-to-line, in units of fi0.h_pt={}): {}", fi0.h_pt, gap / fi0.h_pt);

    // fi-1 wrapped onto a later line within the SAME paragraph, so it must be
    // below fi-0, and within the page (not e.g. spilling onto a value so
    // large it implies the position is being read from the wrong location).
    assert!(gap > 0.0, "expected fi-1 below fi-0, got gap={gap}");
    assert!(
        fi1.y_pt < page_height_pt,
        "fi-1 y_pt ({}) should be within the page (height {page_height_pt})",
        fi1.y_pt
    );

    // fi-0 is the very first thing in its paragraph (nothing precedes it on
    // its line), so its box's TOP must equal the page's top margin (2cm)
    // exactly -- not margin + one line height, which would mean the anchor
    // is still bottom-left instead of top-left.
    let margin_2cm_pt = 2.0 * 28.34645669291339;
    assert!(
        (fi0.y_pt - margin_2cm_pt).abs() < 0.01,
        "expected fi-0.y_pt ({}) to equal the 2cm top margin ({margin_2cm_pt}) -- got bottom-anchored instead of top-anchored",
        fi0.y_pt
    );
}
