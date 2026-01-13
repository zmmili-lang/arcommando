# Quick Reference: Scroll Drift Fix

## 🎯 What Was Wrong

```
BEFORE (Drift Reset Bug):
┌─────────────────────────────────┐
│ Screen 1 - Initial              │
│ Row 1 at Y=323    ✅ Aligned    │
│ Row 2 at Y=524                  │
│ ... (8 rows total)              │
└─────────────────────────────────┘
         ↓ Scroll 1610px (goal)
         ↓ Actually scrolls 1620px (+10px drift!)
┌─────────────────────────────────┐
│ Screen 2                        │
│ Row 1 ACTUALLY at Y=313         │
│ OCR expects Y=323   ❌ -10px    │
│ → Reads wrong numbers!          │
└─────────────────────────────────┘
         ↓ Scroll 1610px (goal)
         ↓ Actually scrolls 1608px (-2px drift)
┌─────────────────────────────────┐
│ Screen 3                        │
│ Row 1 ACTUALLY at Y=331         │
│ OCR expects Y=323   ❌ +8px     │
│ → TOTAL DRIFT: +8px accumulated │
│ → Gets worse each scroll!       │
└─────────────────────────────────┘
```

## ✅ What's Fixed Now

```
AFTER (Auto-Correction Active):
┌─────────────────────────────────┐
│ Screen 1 - Initial              │
│ Row 1 at Y=323    ✅            │
│ current_y_drift = 0             │
└─────────────────────────────────┘
         ↓ Scroll 1610px (goal)
         ↓ Actually scrolls 1620px
         ↓ drift = +10px
┌─────────────────────────────────┐
│ Screen 2                        │
│ Row 1 ACTUALLY at Y=313         │
│ current_y_drift = +10           │
│ OCR checks Y=323+10=333  ✅     │
│ → Correct reading!              │
└─────────────────────────────────┘
         ↓ Scroll 1610px (goal)
         ↓ Actually scrolls 1608px
         ↓ drift = -2px
┌─────────────────────────────────┐
│ Screen 3                        │
│ Row 1 ACTUALLY at Y=331         │
│ current_y_drift = 10-2 = +8     │
│ OCR checks Y=323+8=331   ✅     │
│ → Still correct!                │
└─────────────────────────────────┘
```

## 🚀 Quick Commands

### Just Run Scraper (Auto-correction active)
```bash
python scraper/auto_scraper_tesseract.py --players 100
```

### Measure Your Scroll Distance
```bash
python scraper/scroll_calibrator.py --measure
```

### Test Your Scroll 5 Times
```bash
python scraper/scroll_calibrator.py --test --scrolls 5
```

### Check Row Alignment Visually
```bash
python scraper/scroll_calibrator.py --ruler
```

## 📊 What to Expect

### Good Drift (Normal):
```
[DRIFT] Step: +5.0px | Cumulative: +5.0px
[DRIFT] Step: -3.0px | Cumulative: +2.0px
[DRIFT] Step: +4.0px | Cumulative: +6.0px
```
✅ Small variations (±10px) are normal and corrected automatically

### Bad Drift (Needs Tuning):
```
[DRIFT] Step: +42.0px | Cumulative: +42.0px
[DRIFT] Step: +38.0px | Cumulative: +80.0px
[DRIFT] Step: +45.0px | Cumulative: +125.0px
```
❌ Large consistent drift means SCROLL_END needs adjustment
→ Run calibration tool to get recommended value

## 🔧 Manual Tuning (If Needed)

1. Run calibrator:
   ```bash
   python scraper/scroll_calibrator.py --measure
   ```

2. Note recommended `SCROLL_END` value

3. Edit `auto_scraper_tesseract.py` line 74:
   ```python
   'SCROLL_END': (540, <recommended_value>),
   ```

4. Test again:
   ```bash
   python scraper/scroll_calibrator.py --test --scrolls 3
   ```

## 💡 Pro Tips

1. **First run?** Use `--debug-images` to save OCR crops for verification:
   ```bash
   python scraper/auto_scraper_tesseract.py --players 20 --debug-images
   ```
   Check `kingshot_data/debug_ocr/` for alignment

2. **Emulator lagging?** Increase scroll duration in line 202:
   ```python
   device.shell(f"input swipe {x} {y_start} {x} {y_end} 3000")  # 3 seconds
   ```

3. **Still having issues?** Check if `FIRST_ROW_Y` is correct:
   ```bash
   python scraper/scroll_calibrator.py --ruler
   ```
   Red lines should align with row centers in `ruler_view.png`

## 📁 Files You Got

- ✅ `auto_scraper_tesseract.py` - **FIXED** (drift correction enabled)
- ✅ `scroll_calibrator.py` - **NEW** (calibration tool)
- ✅ `SCROLL_CALIBRATION.md` - **NEW** (full guide)
- ✅ `SCROLL_QUICK_REF.md` - **NEW** (this file, quick reference)

## ❓ Still Confused?

Read `SCROLL_CALIBRATION.md` for:
- Detailed technical explanation
- Workflow recommendations
- Troubleshooting guide
- Advanced configuration
