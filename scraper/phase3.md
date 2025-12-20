Project: Kingshot OCR Scraper - Phase 3: Orchestration and Data Structuring

1. Objective

Integrate the functions from Phase 1 and 2 into the final scrape_leaderboard loop. Implement basic data cleaning and output the results to a file.

2. Dependencies

Requires all functions from Phase 1 (ADB control) and Phase 2 (OCR/Image processing) to be present.

Python Libraries: json or csv (for saving structured data).

3. Functions Required

New Function clean_and_structure_data(raw_data_list):

Accepts the combined list of raw OCR strings (which may contain duplicates and noise).

Processes each string to identify Player Name and Power Score. (This is the most complex step: requires regex/string splitting to separate the numerical power from the name text).

Crucially, it must deduplicate the list, as multiple scrolls will capture the same players.

Returns a list of structured Python dictionaries (e.g., [{'name': 'PlayerX', 'power': '123M'}, ...]).

New Function save_data_to_file(structured_data, filename):

Writes the final, structured list of dictionaries to a JSON file in the OUTPUT_DIR.

Finalize scrape_leaderboard(device, max_scrolls=10):

This function must implement the full loop: Tap -> Capture -> OCR -> Scroll -> Loop.

It should collect ALL raw OCR output across all scrolls.

After the loop, it should call clean_and_structure_data() and then save_data_to_file().

4. Test/Verification

The final script run must:

Execute the full scrape_leaderboard sequence (e.g., 5 scrolls).

Print the count of unique structured player entries.

Confirm that a readable players.json file is created in the output directory containing the structured name and power data.