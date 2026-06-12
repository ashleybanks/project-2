use wasm_bindgen::prelude::*;
use js_sys::{Array, Uint8Array};

use crate::frontend_model::{map_to_block_model, FrontendTopLevel};
use crate::model::StylesheetDef;

#[wasm_bindgen]
pub fn render_preview(
    blocks_json: &str,
    stylesheet_json: &str,
    font_data: &Array,
) -> Result<Vec<u8>, JsValue> {
    let blocks: Vec<FrontendTopLevel> = serde_json::from_str(blocks_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse blocks: {e}")))?;

    let stylesheet: Option<StylesheetDef> = if stylesheet_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(stylesheet_json).ok()
    };

    let fonts: Vec<Vec<u8>> = (0..font_data.length())
        .map(|i| Uint8Array::new(&font_data.get(i)).to_vec())
        .collect();

    let model = map_to_block_model(blocks);
    let source = crate::compile(&model, stylesheet.as_ref());
    let payload = serde_json::Value::Object(Default::default());

    crate::render_with_fonts(&source, &payload, &fonts)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
