import pdfplumber

with pdfplumber.open(
    r"C:\Users\LENOVO\Downloads\Roof_Inspection_256 Hansen Rd N Brampton.pdf.pdf"
) as pdf:
    for page_num, page in enumerate(pdf.pages):
        print(f"--- Page {page_num + 1} ---")
        seen = set()
        for ch in page.chars:
            key = (ch["fontname"], round(ch["size"], 1))
            if key not in seen:
                seen.add(key)
                print(ch["text"], "|", ch["fontname"], "|", round(ch["size"], 1))
