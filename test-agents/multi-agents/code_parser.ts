const fs = require('fs');
const path = require('path');

interface Page {
    name: string;
    wxml: string;
    wxss: string;
    js: string;
    json: any;
}

export function generateMiniProgram(jsonstr: string, outputDir: string) {
    let jsonData;
    try {
        jsonData = JSON.parse(jsonstr);
      } catch (error) {
        console.error("JSON Parse Error:", error);
        console.log("Problematic JSON string:", jsonstr);
      }
    console.log("generateMiniProgram\n", jsonData, outputDir);

    // Create the main directory for the mini-program
    fs.mkdirSync(outputDir, { recursive: true });

    // Create app.json
    fs.writeFileSync(path.join(outputDir, 'app.json'), JSON.stringify(jsonData.appJson, null, 2));

    // Create app.js
    fs.writeFileSync(path.join(outputDir, 'app.js'), jsonData.appJs);

    fs.writeFileSync(path.join(outputDir, 'app.wxss'), jsonData.appWxss);

    fs.writeFileSync(path.join(outputDir, 'fide.project.config.json'), JSON.stringify(jsonData.projectJson, null, 2));

    // Create each page directory and its files
    jsonData.pages.forEach((page: {
        name: string;
        wxml: string;
        wxss: string;
        js: string;
        json: object;
    }) => {
        const pageDir = path.join(outputDir, `pages/${page.name}`);
        fs.mkdirSync(pageDir, { recursive: true });

        // Write WXML file
        fs.writeFileSync(path.join(pageDir, `${page.name}.wxml`), page.wxml);

        // Write WXSS file
        fs.writeFileSync(path.join(pageDir, `${page.name}.wxss`), page.wxss);

        // Write JS file
        fs.writeFileSync(path.join(pageDir, `${page.name}.js`), page.js);

        // Write JSON file
        fs.writeFileSync(path.join(pageDir, `${page.name}.json`), JSON.stringify(page.json, null, 2));
    });
}

export function serializeMiniProgram(inputDir: string) {
    console.log("serializeMiniProgram", inputDir);
    const result: {
        name: string;
        description: string;
        category: string;
        appJs: string;
        "app.wxss": string;
        "app.json": object;
        "fide.project.config.json": object;
        "sitemap.json": object;
        pages: Page[];
        images: any[];
    } = {
        name: path.basename(inputDir),
        description: "",
        category: "",
        appJs: readFileOrLog(path.join(inputDir, 'app.js')),
        "app.wxss": readFileOrLog(path.join(inputDir, 'app.ftss')),
        "app.json": readJsonOrLog(path.join(inputDir, 'app.json')),
        "fide.project.config.json": readJsonOrLog(path.join(inputDir, 'fide.project.config.json')),
        "sitemap.json": readJsonOrLog(path.join(inputDir, 'sitemap.json')),
        pages: [],
        images: []
    };

    // Serialize pages
    const pagesDir = path.join(inputDir, 'pages');
    if (!fs.existsSync(pagesDir)) {
        console.log(`Missing directory: ${pagesDir}`);
    } else {
        fs.readdirSync(pagesDir).forEach((pageName: string) => {
            const pagePath = path.join(pagesDir, pageName);
            if (fs.statSync(pagePath).isDirectory()) {
                result.pages.push({
                    name: pageName,
                    wxml: readFileOrLogWithAlternative(pagePath, pageName, ['wxml', 'fxml']),
                    wxss: readFileOrLogWithAlternative(pagePath, pageName, ['wxss', 'ftss']),
                    js: readFileOrLog(path.join(pagePath, `${pageName}.js`)),
                    json: readJsonOrLog(path.join(pagePath, `${pageName}.json`))
                });
            }
        });
    }

    // Serialize images
    const imagesDir = path.join(inputDir, 'images');
    if (!fs.existsSync(imagesDir)) {
        console.log(`Missing directory: ${imagesDir}`);
    } else {
        fs.readdirSync(imagesDir).forEach((imageName: string) => {
            const imagePath = path.join(imagesDir, imageName);
            if (fs.statSync(imagePath).isFile()) {
                result.images.push({
                    path: `images/${imageName}`,
                    content: readFileOrLog(imagePath, 'base64')
                });
            }
        });
    }

    return result;
}

function readFileOrLog(filePath: string, encoding: string = 'utf8') {
    if (!fs.existsSync(filePath)) {
        console.log(`Missing file: ${filePath}`);
        return '';
    }
    try {
        return fs.readFileSync(filePath, encoding);
    } catch (error) {
        console.log(`Error reading file: ${filePath}`);
        return '';
    }
}

function readJsonOrLog(filePath: string) {
    if (!fs.existsSync(filePath)) {
        console.log(`Missing file: ${filePath}`);
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.log(`Error parsing JSON file: ${filePath}`);
        return {};
    }
}

function readFileOrLogWithAlternative(dirPath: string, fileName: string, extensions: string[]) {
    for (const ext of extensions) {
        const filePath = path.join(dirPath, `${fileName}.${ext}`);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
    }
    console.log(`Missing file: ${fileName}.{${extensions.join(',')}} in ${dirPath}`);
    return '';
}

