# Scroll Calibration Results - 2026-01-08 (Updated)

## 🔄 Late Update: Strategy Change

While testing the 8-row scroll (1610px target), we encountered **extreme variance** on the second scroll:
```
[DRIFT] ❌ Step: +34.0px | Cumulative: +34.0px
```
This variance was too high for the auto-correction to handle immediately, causing OCR failure on the first row of the next screen.

### 🔴 Problem
- 8-row scroll requires moving 1610px (most of the screen height)
- Physics variation on such a long swipe is massive (>100px variance observed)
- Auto-correction works best for small adjustments (±10-15px), not massive jumps

### ✅ Solution: 6-Row Strategy (Stability First)
We switched from scrolling 8 rows to **scrolling 6 rows**.

**Why?**
1. **Shorter distance**: 1207.5px instead of 1610px → less physics variance
2. **More overlap buffer**: We have 2 extra rows of buffer at the bottom
3. **Slower swipe**: Increased duration to **5000ms** (5 seconds)

### 📝 New Configuration

**File**: `auto_scraper_tesseract.py`

```python
COORDS = {
    'SCROLL_START': (540, 1930),
    'SCROLL_END': (540, 723),      # ← Targets 1207.5px (6 rows)
    'NUM_VISIBLE_ROWS': 6,         # Process only top 6 rows
}

# Scroll function:
- Duration: 5000ms                 # ← Maximum stability
- Wait time: 2.0s
```

### 📉 Impact
- **Speed**: Slower (scrolling more often, moving slower)
- **Reliability**: **Significantly Higher**. By processing fewer rows per screen and scrolling slower, we virtually eliminate the "missed row" risk.

### 🧪 Next Steps

Run the scraper again. You should see much more consistent behavior now.

```bash
python scraper/auto_scraper_tesseract.py --players 150 --fast --yes --debug-images
```
