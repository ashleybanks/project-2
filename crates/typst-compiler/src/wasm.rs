use wasm_bindgen::prelude::*;
use js_sys::{Array, JsString, Uint8Array};

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
    let source = crate::compile(&model, stylesheet.as_ref(), false);
    let payload = serde_json::Value::Object(Default::default());

    crate::render_with_fonts(&source, &payload, &fonts)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn render_preview_svg(
    blocks_json: &str,
    stylesheet_json: &str,
    font_data: &Array,
) -> Result<Array, JsValue> {
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
    let source = crate::compile(&model, stylesheet.as_ref(), false);
    let payload = serde_json::Value::Object(Default::default());

    let pages = crate::render_svg_with_fonts(&source, &payload, &fonts)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let result = Array::new();
    for page in pages {
        result.push(&JsString::from(page.as_str()));
    }
    Ok(result)
}

#[wasm_bindgen]
pub fn render_preview_with_data_svg(
    blocks_json: &str,
    stylesheet_json: &str,
    data_json: &str,
    font_data: &Array,
    highlight_fields: bool,
) -> Result<Array, JsValue> {
    let mut blocks: Vec<FrontendTopLevel> = serde_json::from_str(blocks_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse blocks: {e}")))?;

    let stylesheet: Option<StylesheetDef> = if stylesheet_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(stylesheet_json).ok()
    };

    let payload: serde_json::Value = if data_json.trim().is_empty() {
        serde_json::Value::Object(Default::default())
    } else {
        serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data JSON: {e}")))?
    };

    let fonts: Vec<Vec<u8>> = (0..font_data.length())
        .map(|i| Uint8Array::new(&font_data.get(i)).to_vec())
        .collect();

    let augmented_payload =
        crate::frontend_model::evaluate_and_apply_expressions(&mut blocks, &payload);

    let model = map_to_block_model(blocks);
    let source = crate::compile(&model, stylesheet.as_ref(), highlight_fields);

    let pages = crate::render_svg_with_fonts(&source, &augmented_payload, &fonts)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let result = Array::new();
    for page in pages {
        result.push(&JsString::from(page.as_str()));
    }
    Ok(result)
}

/// Same as `render_preview_with_data_svg`, but also returns the on-page
/// position of every field-intent chip (for the Fields-mode overlay), as a
/// single JSON string: `{ "pages": [...], "positions": [{ key, page, x_pt, y_pt }] }`.
#[wasm_bindgen]
pub fn render_preview_with_data_svg_positions(
    blocks_json: &str,
    stylesheet_json: &str,
    data_json: &str,
    font_data: &Array,
    highlight_fields: bool,
) -> Result<JsString, JsValue> {
    let mut blocks: Vec<FrontendTopLevel> = serde_json::from_str(blocks_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse blocks: {e}")))?;

    let stylesheet: Option<StylesheetDef> = if stylesheet_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(stylesheet_json).ok()
    };

    let payload: serde_json::Value = if data_json.trim().is_empty() {
        serde_json::Value::Object(Default::default())
    } else {
        serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data JSON: {e}")))?
    };

    let fonts: Vec<Vec<u8>> = (0..font_data.length())
        .map(|i| Uint8Array::new(&font_data.get(i)).to_vec())
        .collect();

    let augmented_payload =
        crate::frontend_model::evaluate_and_apply_expressions(&mut blocks, &payload);

    let model = map_to_block_model(blocks);
    let source = crate::compile(&model, stylesheet.as_ref(), highlight_fields);

    let (pages, positions) =
        crate::renderer::render_svg_with_fonts_and_positions(&source, &augmented_payload, &fonts)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let result = serde_json::json!({ "pages": pages, "positions": positions });
    serde_json::to_string(&result)
        .map(|s| JsString::from(s.as_str()))
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {e}")))
}

#[wasm_bindgen]
pub fn render_preview_with_data(
    blocks_json: &str,
    stylesheet_json: &str,
    data_json: &str,
    font_data: &Array,
) -> Result<Vec<u8>, JsValue> {
    let blocks: Vec<FrontendTopLevel> = serde_json::from_str(blocks_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse blocks: {e}")))?;

    let stylesheet: Option<crate::model::StylesheetDef> = if stylesheet_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(stylesheet_json).ok()
    };

    let payload: serde_json::Value = if data_json.trim().is_empty() {
        serde_json::Value::Object(Default::default())
    } else {
        serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data JSON: {e}")))?
    };

    let fonts: Vec<Vec<u8>> = (0..font_data.length())
        .map(|i| Uint8Array::new(&font_data.get(i)).to_vec())
        .collect();

    let model = map_to_block_model(blocks);
    let source = crate::compile(&model, stylesheet.as_ref(), false);

    crate::render_with_fonts(&source, &payload, &fonts)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
