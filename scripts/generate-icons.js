const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];

const createSvgIcon = (size) => {
    const padding = size * 0.1;
    const cornerRadius = size * 0.12;
    const fontSize = size * 0.35;
    
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg-gradient-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#5ed4ba;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ec9b0;stop-opacity:1" />
            </linearGradient>
            <filter id="shadow-${size}">
                <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.03}" flood-opacity="0.3"/>
            </filter>
        </defs>
        
        <!-- Background -->
        <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg-gradient-${size})" filter="url(#shadow-${size})"/>
        
        <!-- Note lines -->
        <g opacity="0.3">
            <line x1="${padding}" y1="${size * 0.35}" x2="${size - padding}" y2="${size * 0.35}" 
                  stroke="white" stroke-width="${size * 0.015}"/>
            <line x1="${padding}" y1="${size * 0.5}" x2="${size - padding}" y2="${size * 0.5}" 
                  stroke="white" stroke-width="${size * 0.015}"/>
            <line x1="${padding}" y1="${size * 0.65}" x2="${size * 0.7}" y2="${size * 0.65}" 
                  stroke="white" stroke-width="${size * 0.015}"/>
        </g>
        
        <!-- Letter N -->
        <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" 
              fill="white" font-family="system-ui, -apple-system, sans-serif" 
              font-size="${fontSize}px" font-weight="600">
            N
        </text>
    </svg>`;
};

async function generateIcons() {
    // Ensure icons directory exists
    const iconsDir = path.join(__dirname, '..', 'icons');
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }

    console.log('Generating browser extension icons...\n');

    for (const size of sizes) {
        try {
            // Generate SVG
            const svg = createSvgIcon(size);
            const svgPath = path.join(iconsDir, `icon-${size}.svg`);
            fs.writeFileSync(svgPath, svg);
            console.log(`✓ Created icon-${size}.svg`);

            // Convert to PNG
            const pngPath = path.join(iconsDir, `icon-${size}.png`);
            await sharp(Buffer.from(svg))
                .resize(size, size)
                .png()
                .toFile(pngPath);
            console.log(`✓ Created icon-${size}.png`);
            
        } catch (error) {
            console.error(`✗ Error creating icon-${size}:`, error.message);
        }
    }
    
    console.log('\n🎉 All browser extension icons generated successfully!');
}

if (require.main === module) {
    generateIcons().catch(console.error);
}

module.exports = { generateIcons };