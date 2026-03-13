# Brain Protein & Phosphosite Dual Heatmap Viewer

An interactive web-based visualization tool for exploring **global protein** and **phosphosite-specific** expression levels across different brain regions. This viewer allows researchers to visualize proteomics data on dual brain atlases with intuitive color-coded heatmaps.

🚀 **[Live Demo](https://vambay.github.io/brain-protein-heatmap-viewer/)**

![Dual Brain Viewer](screenshot.png)

## ✨ Features

### 🧠 Dual Brain Visualization
- **Side-by-side viewers** for global protein and phosphosite data
- **Synchronized color scale** based on global protein values
- **Independent pan and zoom** for each brain atlas

### 🎨 Advanced Visualization
- **Plasma Color Scheme**: Perceptually uniform color scale for accurate data visualization
- **Unified Color Scale**: Both viewers use the same scale for direct comparison
- **Multiple Transformations**: View data as raw values, log2, or z-score normalized
- **Adjustable Opacity**: Fine-tune visualization with alpha slider

### 🔍 Powerful Search
- Search by **UniProt accession** (e.g., Q61029)
- Search by **gene name** (e.g., Slc9a6)
- Search by **protein name** (e.g., "Sodium/hydrogen exchanger")
- Auto-complete suggestions with metadata preview

### 📊 Phosphosite Selection
- **Dropdown menu** to select specific phosphorylation sites
- **"All sites combined"** option to view average across all sites
- **Site count indicator** in search results

### 📋 Rich Metadata Display
- Protein name with full description
- Gene name(s)
- Tissue specificity information
- Region-specific values for both global and phospho data

### 💾 Export & Share
- Export both brain views as a single PNG image
- Share-friendly URL structure

## 📊 Data Coverage

- **7,137 total proteins**
  - 7,080 proteins with global expression data
  - 57 proteins with phosphosite data only
- **3,676 phosphosites** from 1,160 unique proteins
- **10 brain regions**: Cerebellum, Midbrain, Thalamus, Lateral habenula, Hippocampus, Dentate gyrus, Basic cell groups and regions (grey), Lateral septal nucleus, Caudoputamen, Neocortex

## 🎯 Use Cases

### Scenario 1: Protein with Phosphosites
**Example**: Q61029 (has 2 phosphosites)
- ✅ Left viewer: Global protein expression
- ✅ Right viewer: Phosphosite expression (T159, S158, or average)
- ✅ Dropdown: Select specific site or view all sites combined

### Scenario 2: Protein without Phosphosites  
**Example**: A2A4P0 (no phosphosites)
- ✅ Left viewer: Global protein expression
- ⚫ Right viewer: All regions grey (NA)
- 🚫 Dropdown: Hidden

### Scenario 3: Phosphosite without Global Data
**Example**: A1A5B6 (phospho-only)
- ⚫ Left viewer: All regions grey (NA)
- ✅ Right viewer: Phosphosite expression
- ✅ Dropdown: Select specific sites

## 🚀 Quick Start

### Option 1: Use GitHub Pages (Recommended)
Simply visit: [https://vambay.github.io/brain-protein-heatmap-viewer/](https://vambay.github.io/brain-protein-heatmap-viewer/)

### Option 2: Run Locally

1. **Clone the repository**
   ```bash
   git clone https://github.com/VamBay/brain-protein-heatmap-viewer.git
   cd brain-protein-heatmap-viewer
   ```

2. **Start a local server**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Or Python 2
   python -m SimpleHTTPServer 8000
   ```

3. **Open in browser**
   ```
   http://localhost:8000/
   ```

## 📁 Repository Structure

```
brain-protein-heatmap-viewer/
├── index.html                   # Main HTML file
├── style.css                    # Styling
├── app.js                       # JavaScript logic
├── data_protein_simple.csv      # Global protein expression data
├── data_phospho_simple.csv      # Phosphosite expression data
├── brain.svg                    # Brain atlas SVG
├── process_data.py              # Data processing script (optional)
├── README.md                    # This file
├── LICENSE                      # MIT License
└── .gitignore                   # Git ignore file
```

## 🔧 Data Format

### Protein Data (data_protein_simple.csv)
```csv
accession,protein_name,gene_name,tissue_specificity,Cerebellum,Midbrain,...
Q61029,Lamina-associated polypeptide 2 beta,Tmpo,,0.5,0.3,...
```

### Phosphosite Data (data_phospho_simple.csv)
```csv
phosphosite,accession,site,Cerebellum,Midbrain,...
sp|Q61029|LAP2B_MOUSE@T159,Q61029,T159,1.0,0.6,...
```

## 🛠️ Customization

### Changing the Color Scheme

The color scheme is defined in `app.js` (around line 52):

```javascript
// Plasma gradient: dark blue -> purple -> orange -> yellow
function colorForValue(v, vmin, vmax){
  if(!isFinite(v)) return {r:155,g:155,b:155}; // grey for NA
  if(vmax === vmin) return {r:30,g:144,b:255};
  const t = clamp((v - vmin)/(vmax - vmin), 0, 1);
  if(t < 0.33) return lerpColor("#0d0887", "#6a00a8", t/0.33);
  if(t < 0.66) return lerpColor("#6a00a8", "#b12a90", (t-0.33)/0.33);
  if(t < 0.85) return lerpColor("#b12a90", "#e16462", (t-0.66)/0.19);
  return lerpColor("#e16462", "#f0f921", (t-0.85)/0.15);
}
```

Update both this function and the CSS gradient in `style.css` (line 73).

### Using Your Own Data

1. **Prepare your data** in the format shown above
2. **Run the processing script**:
   ```bash
   python process_data.py
   ```
3. **Replace** `data_protein_simple.csv` and `data_phospho_simple.csv`

### Using a Different Brain Atlas

Replace `brain.svg` with your custom SVG. Ensure:
- Brain regions have unique `id` attributes
- Region IDs match the column names in your CSV (normalized: lowercase, spaces/underscores treated the same)

## 🌐 Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

Requires a modern browser with ES6+ support.

## 🔬 Technologies Used

- Pure JavaScript (ES6+)
- SVG manipulation for brain visualization
- CSS3 for styling
- Python for data processing
- No external dependencies or frameworks for the viewer

## 📖 How It Works

### Unified Color Scale
The color scale is **determined by global protein values**, ensuring both viewers are directly comparable:
1. Calculate min/max from global protein data
2. Apply same color range to both viewers
3. This reveals if phosphosites are higher/lower than global levels

### Region Matching
The viewer intelligently matches CSV column names to SVG element IDs:
- Normalizes spaces and underscores
- Handles numbered duplicates (e.g., `Caudoputamen_1`, `Caudoputamen_2`)
- Case-insensitive matching

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Brain atlas SVG: Allen Brain Atlas
- Protein expression data: [Add your source]
- Phosphosite data: [Add your source]
- Plasma color scheme inspired by Matplotlib's perceptually uniform colormaps

## 📧 Contact

For questions, issues, or collaboration:
- Open an issue on GitHub
- Visit: https://github.com/VamBay/brain-protein-heatmap-viewer

## 📝 Citation

If you use this tool in your research, please cite:

```bibtex
@software{brain_protein_phospho_viewer,
  author = {VamBay},
  title = {Brain Protein & Phosphosite Dual Heatmap Viewer},
  year = {2026},
  url = {https://github.com/VamBay/brain-protein-heatmap-viewer}
}
```

## 🔄 Changelog

### Version 2.0.0 (2026-01-30) - Dual Viewer Release
- ✨ Added dual side-by-side brain viewers
- ✨ Phosphosite-specific visualization
- ✨ Unified color scale based on global protein values
- ✨ Enhanced search by accession, gene name, or protein name
- ✨ Protein metadata display (protein name, gene, tissue specificity)
- ✨ Phosphosite selection dropdown
- 📊 Expanded dataset: 7,137 proteins, 3,676 phosphosites
- 🎨 Plasma color scheme
- 💾 Export both views as single PNG

### Version 1.0.0 (2026-01-30) - Initial Release
- 🧠 Single brain viewer
- 🎨 Interactive heatmap visualization
- 🔍 Protein search
- 📊 Multiple data transformations
- 💾 Export to PNG

---

**Made with ❤️ for the neuroscience and proteomics community**
