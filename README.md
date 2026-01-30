# Brain Protein Heatmap Viewer

An interactive web-based visualization tool for exploring protein expression levels across different brain regions. This viewer allows researchers to visualize proteomics data on a brain atlas with an intuitive color-coded heatmap.

## Features

- 🧠 **Interactive Brain Atlas**: Pan, zoom, and explore brain regions
- 🎨 **Plasma Color Scheme**: Perceptually uniform color scale for accurate data visualization
- 🔍 **Protein Search**: Search by accession ID, gene name, or protein name
- 📊 **Multiple Transformations**: View data as raw values, log2, or z-score normalized
- 📋 **Detailed Information**: Display protein names, gene names, and tissue specificity
- 💾 **Export Functionality**: Export visualizations as PNG images
- ⚡ **Fast Performance**: Handles thousands of proteins efficiently

## Demo

**🚀 [Live Demo](https://vambay.github.io/brain-protein-heatmap-viewer/)**

### Run Locally:
1. Download all files to a folder
2. Run a local server: `python -m http.server 8000`
3. Open `http://localhost:8000` in your browser

## Data Format

The viewer expects a CSV file with the following structure:

```csv
AccessionClean,Cerebellum,Midbrain,Thalamus,Lateral_habenula,Hippocampus,Dentate_gyrus,Basic_cell_groups_and_regions_grey,Lateral_septal_nucleus,Caudoputamen,Neocortex,Protein_names,Gene_Names,Tissue_specificity
A0JLY1,-1.437275921,NA,NA,NA,NA,NA,NA,NA,NA,-1.115746225,Cilia- and flagella- associated protein 210,Cfap210 Ccdc173,
A1A5B6,0.34753176,-0.475901654,0.008335305,NA,0.204177289,0.981086183,NA,0.126344244,0.140757539,0.184110935,TBC1 domain family member 25,Tbc1d25,
```

### Required Columns
- **AccessionClean**: UniProt accession ID or unique identifier
- **Brain Region Columns**: One or more columns with numeric expression values (can include NA values)

### Optional Columns
- **Protein_names**: Full protein name with description
- **Gene_Names**: Gene symbol(s)
- **Tissue_specificity**: Tissue-specific expression information

## Installation & Usage

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/brain-protein-heatmap-viewer.git
   cd brain-protein-heatmap-viewer
   ```

2. **Prepare your data**
   - Replace `data.csv` with your protein expression data
   - Replace `brain.svg` with your brain atlas SVG (if needed)

3. **Run a local server**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js
   npx http-server -p 8000
   ```

4. **Open in browser**
   Navigate to `http://localhost:8000`

### File Structure

```
brain-protein-heatmap-viewer/
├── index.html          # Main HTML file
├── app.js             # JavaScript logic
├── style.css          # Styling
├── data.csv           # Protein expression data
├── brain.svg          # Brain atlas SVG
├── README.md          # This file
└── LICENSE            # License file
```

## Customization

### Changing the Color Scheme

The color scheme is defined in `app.js` (lines 47-56). Current scheme is Plasma:

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

Update both the function and the CSS gradient in `style.css` (line 70-75).

### Using Your Own Brain Atlas

Replace `brain.svg` with your custom SVG. Ensure:
- Brain regions have unique `id` attributes
- Region IDs match the column names in your CSV (case-insensitive, spaces normalized)

### Modifying Brain Regions

Edit `data.csv` columns to match your brain atlas regions. The viewer automatically detects region columns.

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

Requires a modern browser with ES6+ support.

## Technologies Used

- Pure JavaScript (ES6+)
- SVG manipulation
- CSS3 for styling
- No external dependencies or frameworks

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Citation

If you use this tool in your research, please cite:

```bibtex
@software{brain_protein_heatmap_viewer,
  author = {Your Name},
  title = {Brain Protein Heatmap Viewer},
  year = {2026},
  url = {https://github.com/your-username/brain-protein-heatmap-viewer}
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Brain atlas SVG data source: [Add your source]
- Protein expression data: [Add your source]
- Plasma color scheme inspired by Matplotlib's perceptually uniform colormaps

## Support

For questions or issues, please:
- Open an issue on GitHub
- Contact: your.email@institution.edu

## Changelog

### Version 1.0.0 (2026-01-30)
- Initial release
- Interactive brain atlas visualization
- Plasma color scheme
- Protein search functionality
- Multiple data transformations
- Export to PNG
- Protein metadata display

---

**Made with ❤️ for the neuroscience community**
