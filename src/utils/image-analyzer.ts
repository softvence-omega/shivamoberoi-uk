import puppeteer from "puppeteer";
import axios from "axios"

export async function  analyzeImage(imageUrl: string) {
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();
    
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer'});
      const buffer = Buffer.from(response.data as ArrayBuffer);
        const fileSize = buffer.length;

        await page.setContent(`<img src="data:image/jpeg;base64,${buffer.toString('base64')}" />`);
        const { width, height} = await page.evaluate(() => {
            const img = document.querySelector('img');
            if (img && img.naturalWidth !== undefined && img.naturalHeight !== undefined) {
                return { width: img.naturalWidth, height: img.naturalHeight };
            } else {
                return { width: 0, height: 0 };
            }
        });

        const isBlurry = width <100 || height < 100 || fileSize /(width * height)< 0.1;

        await browser.close();
        return { fileSize, width, height, isBlurry};

    } catch(err) {
        console.error(`Error analyzing image ${imageUrl}: ${err.message}`);
        await browser.close();
        return { fileSize: 0, width: 0, height: 0, isBlurry: true}
    }
}