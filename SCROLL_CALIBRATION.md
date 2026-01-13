# Scroll Distance Calibration & Drift Correction Guide

## Problem Overview

The `auto_scraper_tesseract.py` script was experiencing **scroll alignment issues** where OCR readings became increasingly inaccurate after each scroll. This happened because:

1. **Fixed vs Actual Scroll Distance**: The script performs a fixed pixel scroll (1615px for 8 rows), but the actual emulator scroll can vary slightly due to:
   - Emulator physics/inertia
   - Animation timing variations
   - Screen refresh rate inconsistencies

2. **Cumulative Drift**: Even small per-scroll errors (±5-10px) accumulate over multiple scrolls, causing OCR boxes to misalign with player rows.

3. **Previous Bug**: The script *calculated* drift but immediately reset it to 0, never actually applying the correction!

## Solutions Implemented

### ✅ Solution 1: Drift Auto-Correction (RECOMMENDED)

**File Modified**: `auto_scraper_tesseract.py` (line ~1200)

**What Changed**:
- **Removed** the line that reset `current_y_drift` to 0 after each scroll
- **Enabled** cumulative drift tracking and automatic correction
- The drift is now applied as `y_offset` when calculating OCR box positions

**How It Works**:
```python
# Before each scroll:
1. Capture screenshot BEFORE scroll → img_before
2. Perform scroll action
3. Capture screenshot AFTER scroll → img_after
4. Calculate actual pixel shift using image comparison
5. drift = actual_shift - expected_shift (e.g., 1620 - 1610 = +10px)
6. current_y_drift += drift  # Accumulate (was being reset!)
7. Apply current_y_drift to all OCR calculations for next screen
```

**Benefits**:
- ✅ **Zero configuration** - works automatically
- ✅ **Self-correcting** - adapts to each scroll's actual distance
- ✅ **Robust** - handles variable emulator performance

**Usage**:
No changes needed! Just run the scraper as normal:
```bash
python scraper/auto_scraper_tesseract.py --players 100
```

The drift correction now happens automatically on every scroll.

---

### 🛠️ Solution 2: Scroll Calibration Tool (FOR FINE-TUNING)

**New File**: `scroll_calibrator.py`

This interactive tool helps you measure, test, and optimize scroll parameters.

#### Mode 1: Measure Scroll Distance

Captures before/after screenshots and calculates exact scroll distance:

```bash
python scraper/scroll_calibrator.py --measure
```

**Output**:
```
📊 MEASUREMENT RESULTS
==========================================
Expected scroll distance: 1610px
Actual measured shift:    1625px
Drift/Error:              +15px
Confidence score:         87.3%
==========================================

💡 RECOMMENDATIONS:
   To scroll exactly 8 rows (1610px):
   
   Recommended config:
     SCROLL_START: (540, 1930)
     SCROLL_END: (540, 305)
     → Should achieve ~1610px scroll
```

**Files Generated**:
- `scroll_before.png` - Screenshot before scroll
- `scroll_after.png` - Screenshot after scroll
- `scroll_before_annotated.png` - With row alignment lines
- `scroll_after_annotated.png` - With row alignment lines

#### Mode 2: Test Scroll Configuration

Test a specific scroll setup multiple times to verify consistency:

```bash
python scraper/scroll_calibrator.py --test --ystart 1930 --yend 305 --scrolls 5
```

**Output**:
```
📊 TEST SUMMARY
==========================================
Scrolls tested:     5
Average shift:      1612.4px
Average drift:      +2.4px
Max drift:          6px
Consistency:        ✅ Good
==========================================

Individual results:
  Scroll 1: 1615px (drift: +5px)
  Scroll 2: 1610px (drift: +0px)
  Scroll 3: 1614px (drift: +4px)
  ...
```

#### Mode 3: Visual Ruler

Capture a screenshot with horizontal lines showing where OCR expects each row:

```bash
python scraper/scroll_calibrator.py --ruler
```

**Output**: `ruler_view.png` with red lines at each row position

**Use this to**:
- Verify `FIRST_ROW_Y` is correctly positioned
- Check if `ROW_HEIGHT` matches actual spacing
- Visually confirm alignment before scraping

---

## Recommended Workflow

### For First-Time Setup:

1. **Visual Verification**:
   ```bash
   python scraper/scroll_calibrator.py --ruler
   ```
   Open `ruler_view.png` and verify red lines align with player row centers.

2. **Measure Actual Scroll**:
   ```bash
   python scraper/scroll_calibrator.py --measure
   ```
   Note the recommended `SCROLL_END` value.

3. **Test Consistency** (optional):
   ```bash
   python scraper/scroll_calibrator.py --test --yend <recommended_value> --scrolls 5
   ```
   Verify drift is minimal (< ±10px).

4. **Update Config** (if needed):
   Edit `auto_scraper_tesseract.py` line 74:
   ```python
   'SCROLL_END': (540, 305),  # Update with calibrated value
   ```

5. **Run Scraper**:
   ```bash
   python scraper/auto_scraper_tesseract.py --players 100 --debug-images
   ```
   The drift correction will handle any remaining variance.

### For Ongoing Use:

Just use **Solution 1** (auto-correction). You don't need to recalibrate unless:
- You change emulators
- You change emulator settings (DPI, resolution)
- You notice systematic misreads across all scrolls

---

## How Drift Correction Works (Technical Details)

### Without Correction (OLD):
```
Scroll 1: Expected 1610px, Actual 1620px → drift = +10px
  → current_y_drift = 10px
  → RESET TO 0  ❌
  → Row 1 on Screen 2 is expected at Y=323, but actually at Y=313
  
Scroll 2: Expected 1610px, Actual 1608px → drift = -2px
  → current_y_drift = -2px
  → RESET TO 0  ❌
  → Row 1 on Screen 3 is expected at Y=323, but actually at Y=331
  → Total drift is now 10 + (-2) = +8px, but we don't track it!
```

### With Correction (NEW):
```
Scroll 1: Expected 1610px, Actual 1620px → drift = +10px
  → current_y_drift = +10px
  → ✅ KEPT! Applied as y_offset = +10px
  → Row 1 on Screen 2: Y = 323 + 10 = 333 (correct position!)
  
Scroll 2: Expected 1610px, Actual 1608px → drift = -2px
  → current_y_drift = 10 + (-2) = +8px
  → ✅ KEPT! Applied as y_offset = +8px
  → Row 1 on Screen 3: Y = 323 + 8 = 331 (correct position!)
```

The `y_offset` parameter is passed to:
- `ocr_power_from_row()` - Adjusts power value OCR boxes
- `process_single_player()` - Adjusts tap positions

This ensures OCR boxes and tap targets stay aligned with actual player positions, even if scrolls are imperfect.

---

## Troubleshooting

### Issue: Still getting misreads after correction

**Possible causes**:
1. **FIRST_ROW_Y is wrong** - Use `--ruler` mode to verify
2. **ROW_HEIGHT is wrong** - Measure actual row spacing
3. **Extreme drift (>50px per scroll)** - Emulator issue, try:
   - Increasing scroll duration (line 202): `device.shell(f"input swipe ... 3000")`  # 3 seconds
   - Reducing scroll distance (scroll fewer rows)

### Issue: Calibrator shows low confidence

**Solution**:
- Screen has too much animation/variation
- Wait longer after scroll (increase `time.sleep(1.2)` in calibrator)
- Ensure leaderboard is fully loaded before measuring

### Issue: Drift varies wildly between scrolls

**Solution**:
- Emulator is under heavy load - close other apps
- Increase scroll duration for smoother, more predictable distance
- Consider scrolling fewer rows (e.g., 6 rows = 1207.5px)

---

## Configuration Reference

### Key Constants in `auto_scraper_tesseract.py`:

```python
COORDS = {
    'SCROLL_START': (540, 1930),   # Where swipe begins (Y coordinate)
    'SCROLL_END': (540, 320),      # Where swipe ends (lower = longer scroll)
    'FIRST_ROW_Y': 323,            # Y position of first visible row center
    'ROW_HEIGHT': 201.25,          # Vertical spacing between row centers (px)
    'NUM_VISIBLE_ROWS': 8,         # How many rows fit on screen
}
```

**To scroll exactly N rows**:
```python
target_distance = N * ROW_HEIGHT
SCROLL_END = SCROLL_START - target_distance

# Example for 8 rows:
# 8 * 201.25 = 1610px
# SCROLL_END = 1930 - 1610 = 320
```

---

## Advanced: Manual Scroll Tuning

If auto-correction isn't enough, you can manually tune the scroll:

1. Run measurement:
   ```bash
   python scraper/scroll_calibrator.py --measure
   ```

2. Note the "Actual measured shift"

3. Calculate correction factor:
   ```
   desired_distance = 1610px (8 rows)
   actual_distance = <from measurement>
   
   correction_factor = desired_distance / actual_distance
   current_swipe_distance = SCROLL_START - SCROLL_END = 1930 - 320 = 1610
   
   new_swipe_distance = current_swipe_distance * correction_factor
   new_SCROLL_END = SCROLL_START - new_swipe_distance
   ```

4. Update config and test again

---

## Files Changed

✅ **Modified**:
- `scraper/auto_scraper_tesseract.py` - Enabled drift correction (line 1194-1200)

✅ **Created**:
- `scraper/scroll_calibrator.py` - New calibration tool
- `SCROLL_CALIBRATION.md` - This guide

---

## Summary

**Quick Start** (Most users):
1. The drift correction is now **active by default**
2. Just run the scraper normally
3. OCR should now stay accurate across all scrolls

**Advanced Setup** (For perfectionists):
1. Use calibration tool to measure actual scroll
2. Tune `SCROLL_END` for perfect alignment
3. Verify with test mode
4. Let auto-correction handle residual variance

**Remember**: You don't need perfect scroll distances anymore! The auto-correction adapts to whatever distance your emulator actually scrolls. The calibration tool is for optimization, not requirement.
