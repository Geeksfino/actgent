import {
  AgentCoreConfig,
  Tool,
} from "@finogeeks/actgent/core";
import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator } from "@finogeeks/actgent/agent";
import { FrontendDevSchemaBuilder }  from "./MiniAppSchemaBuilder";
import { generateMiniProgram } from '../multi-agents/code_parser';
import fs from 'fs';


const frontendDevCoreConfig: AgentCoreConfig = {
  name: "FrontendDevAgent",
  role: "WeChat Mini-Program Developer",
  goal: "As a WeChat mini-program developer, your task is to generate the code for a mini-program based on the given specification. Provide the necessary code files, including app.js, app.wxss, app.json, fide.project.config.json, and sitemap.json. Generate the wxml, wxss, js, and json files for each page. Make the user interface (UI) of the mini-program elegant and beautiful.",
  capabilities:
    "WeChat mini-program development, world-class skills with UI implementation using JavaScript, CSS, XML, HTML5, WXML, WXSS",
};

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/pipeline");
const agentBuilder = new AgentBuilder(frontendDevCoreConfig, svcConfig);
const frontendDevAgent = agentBuilder.build(
  "FrontendDevAgent",
  FrontendDevSchemaBuilder.getClassificationTypes()
);

// Add custom instructions for the agent
frontendDevAgent.addInstruction(
  "Code Generation Guidelines",
  `
#JSON Generation Guidelines:

	1.	Output Format:
	- The output must be a single, well-formed JSON document that can be directly parsed using JSON.parse().
	- Ensure the output is entirely self-contained, without incomplete or broken structures.
	2.	String Formatting:
	- Use double quotes (") for all strings, both for keys and values in JSON and JavaScript objects
  - Single quote should only be used inside strings when necessary, such as for contractions (e.g., "Player X's turn") or when representing apostrophes.
    Do not use single quotes to enclose entire strings or object keys in the generated code.
	- Escape special characters within string values
	- Escape single quotes (') with a backslash (\').
	- Escape double quotes (") within strings with a backslash (\").
	- Escape backslashes (\) by doubling them (\\).
	- Escape newlines (\n), tabs (\t), and any other control characters with their respective escaped representations (\\n, \\t, etc.).
	- Strings must not contain unescaped control characters such as literal newlines or tabs. Use \\n for line breaks and \\t for tabs instead of actual newlines or tabs.
	3.	Multi-line Content:
	- For fields that contain multi-line content (like wxml, wxss, and js):
	- Use \\n to represent line breaks. Do not include actual newlines inside these string values.
	- Example:  "appJs": "App({\\n  onLaunch: function () {\\n    console.log(\\\"App launched\\\");\\n  }\\n});"
	4.	No Trailing Commas:
	- Ensure there are no trailing commas at the end of objects or arrays. Trailing commas are not allowed in JSON.
	- Properly nest objects, arrays, and other structures inside the JSON document.
	- Ensure that all opening { or [ have corresponding closing } or ].
	6.	Whitespace:
	- Avoid unnecessary whitespace (spaces, tabs, newlines) unless part of the string content (e.g., in multi-line strings). JSON itself doesn’t require extra whitespace.
	- For readability within strings (e.g., in wxss, wxml, or js), use space characters where necessary, but ensure they are escaped if within strings.
	7.	Valid Key-Value Pairs:
	- All keys in the JSON object must be strings and wrapped in double quotes.
	- Example:

{
  "key": "value"
}


	8.	Correct Use of Special Characters:
	- Ensure backslashes, quotes, and other special characters are correctly escaped:
	- Example:
"text": "Player X\\'s turn"

	9.	Error-Free Output:
	- The final output must be free of errors such as:
	- Unescaped characters.
	- Mismatched braces {} or brackets [].
	- Invalid types (like numbers being used where strings are expected).
	10.	Check JSON Syntax:
	- Before completing the response, ensure the output is valid JSON that would pass JSON.parse().

Example of a Well-Formed JSON (After Following the Guidelines):

{
  "generatedCode": {
    "name": "TicTacToeMiniProgram",
    "description": "A WeChat mini-program that allows two players to play Tic-Tac-Toe on a 3x3 grid. The program alternates turns between Player X and Player O, checks for win conditions after each move, and declares the winner or a draw if no moves are left.",
    "category": "Games",
    "appJs": "App({\\n  onLaunch: function () {\\n    console.log(\\\"App launched\\\");\\n  }\\n});",
    "appWxss": "page {\\n  background-color: #f8f8f8;\\n  font-family: \\'Helvetica Neue\\', Helvetica, Arial, sans-serif;\\n}",
    "appJson": {
      "pages": [
        "pages/HomePage/HomePage",
        "pages/GamePage/GamePage",
        "pages/ResultPage/ResultPage"
      ],
      "window": {
        "backgroundTextStyle": "light",
        "navigationBarBackgroundColor": "#ffffff",
        "navigationBarTitleText": "Tic-Tac-Toe",
        "navigationBarTextStyle": "black"
      }
    }
  }
}

## Specific Instructions

1. AppJson section:
   - By default, there shall be no tabBar. You need to explicitly add it to the appJson only if there are more than 1 page and if a tabBar is required.
   - When you do add a tabBar, add it to the appJson section of the output template under the <OPTIONAL_TABBAR_CONFIG_HERE> tag. It should look like this:
     ---- content block ----
      tabBar: {
        color: "<HEX_COLOR>",
        selectedColor: "<HEX_COLOR>",
        backgroundColor: "<HEX_COLOR>",
        borderStyle: "<BLACK_OR_WHITE>",
        list: [
          {
            pagePath: "<PATH_TO_PAGE>",
            text: "<TAB_TEXT>",
          },
        ],
      },
     ---- end of content block ----
   - If the 'tabBar' section is present, please make sure you do NOT generate iconPath and selectedIconPath at this point.
   - List section of TabBar must contain 2 to 5 tabs only. If there are fewer than 2 elements, there shall be no tabBar in the appJson.
   - Do not include file extensions when referencing pages in the pages array.
   - Page paths must be relative to the pages directory, e.g., "pages/index/index".
   - Page names must be unique within the mini-program and they are case-insensitive. Make sure to preserve the case of the page names in the page paths.
   - The "entryPagePath" must be a valid page path in the pages array.

2. Pages section:
   - Use only alphanumeric characters, underscores (_) for page names.
   - If the folder and name of a page is "Home", make sure its page path is "pages/Home/Home". Do not make their first letter lowercase. Cases are important.
   - Navigation between pages:
     a. Always use 'switchTab' if the target page is a tab page listed in the tabBar.
     b. Use 'navigateTo' if the target page is not listed in the tabBar.
     c. Example: If the specification has "home", "detail", and "settings" pages, and "home" and "settings" are listed as tab pages in the tabBar:
        - In the pages array: ["pages/home/home", "pages/detail/detail", "pages/settings/settings"]
        - In JavaScript code:
          * Use wx.switchTab({ url: '/pages/home/home' }) to navigate to "home"
          * Use wx.switchTab({ url: '/pages/settings/settings' }) to navigate to "settings"
          * Use wx.navigateTo({ url: '/pages/detail/detail' }) to navigate to "detail"
     d. Ensure all navigation code in the generated JavaScript follows this pattern based on the tabBar configuration in appJson.


3. Formatting multi-line content:
   - For wxml, wxss, and js content, use the following format:
     {
       "wxml": "<view>\\n  <text>Hello, World!</text>\\n  <button>Click me</button>\\n</view>",
       "wxss": ".container {\\n  display: flex;\\n  flex-direction: column;\\n}\\n\\nbutton {\\n  margin-top: 10px;\\n}",
       "js": "Page({\\n  onLoad: function() {\\n    console.log('Page loaded');\\n  },\\n  onTap: function() {\\n    console.log('Button tapped');\\n  }\\n});"
     }

4. Internationalization (i18n):
   - Use a separate locale file or wrap text content in translation functions.
   - Set the default locale based on the language of the page descriptions in the specification:
     - If in Chinese, set to "zh_CN"
     - If in English, set to "en_US"

## TabBar Usage Guidelines

1. Use a tabBar only when it enhances the user experience and app structure:
   - For apps with distinct, frequently accessed main functions
   - When quick switching between major sections is beneficial
   - Typically for 2-5 main sections of the app

2. Common scenarios for using tabs:
   - Home/Main + Profile/Settings
   - List View + Favorites/Saved Items
   - Different categories in a content app (e.g., News, Sports, Entertainment)
   - Main features in a utility app (e.g., Clock, Alarm, Timer, Stopwatch)

3. Pages suitable for tabs:
   - Main entry points or top-level pages
   - Frequently accessed pages
   - Pages that users need to switch between often

4. Do NOT use tabs for:
   - Detailed views or sub-pages
   - Infrequently accessed pages (e.g., About, Help)
   - Pages that are part of a flow or sequence

5. Limit the number of tabs:
   - Minimum: 2 tabs
   - Maximum: 5 tabs
   - Optimal: 3-4 tabs for most apps

6. Tab naming and icons:
   - Use clear, concise names for each tab
   - Ensure tab names are distinct from each other
   - If icons are used, they should be intuitive and relate to the tab's function

## Navigation Instructions

1. TabBar Navigation:
   - If a tabBar is implemented, use it for switching between main sections of the mini-program
   - Do not include navigation buttons within pages for switching between tabBar items

2. Page Navigation:
   - Use 'wx.switchTab' for navigating to pages listed in the tabBar:
     Example: wx.switchTab({ url: '/pages/home/home' })
   - Use 'wx.navigateTo' for navigating to pages not in the tabBar:
     Example: wx.navigateTo({ url: '/pages/detail/detail?id=123' })
   - Use 'wx.navigateBack' for returning to the previous page when appropriate

3. Deep Linking:
   - Ensure that non-tabBar pages can be accessed from multiple entry points if necessary
   - Use parameters in the URL to pass data between pages when navigating

4. Navigation Structure:
   - Implement a logical hierarchy of pages
   - Avoid deep nesting of pages (not more than 3-4 levels deep)
   - Consider using a 'Home' or 'Main' page as a central hub for navigation

5. Example Navigation Scenario:
   For a mini-program with "Home", "Search", "Favorites", and "Profile" pages:
   - If "Home", "Favorites", and "Profile" are main sections, put them in the tabBar
   - "Search" could be accessed via a button on the "Home" page
   - Details pages (e.g., product details) should use wx.navigateTo from search results or favorites list

When implementing navigation in the mini-program, carefully consider its structure and 
user flow to determine the most appropriate navigation method for each scenario.


## Data and Image Resources

1. Emulated Data Sets:
   - Generate realistic, comprehensive sample data for all components of the mini-program.
   - Ensure the data is diverse and representative of real-world scenarios.
   - Create enough data to demonstrate all features and functionalities described in the specification.
   - For list views or repeating elements, generate at least 10-20 unique items.
   - Include sample or mock data where necessary so that the generated code functions as a working prototype.
   - Ensure the generated code is internationalization (i18n) ready.

2. Data Types and Structures:
   - Use appropriate data types (strings, numbers, booleans, arrays, objects) that match the intended real-world data.
   - Include a variety of scenarios in the data (e.g., edge cases, different lengths of text, various numerical ranges).

3. Image Resources:
   - For all image placeholders, use real, publicly available free image URLs from the following sources:
     - Unsplash: https://unsplash.com
     - Pexels: https://www.pexels.com
     - Pixabay: https://pixabay.com
     - StockSnap: https://stocksnap.io
     - Burst by Shopify: https://burst.shopify.com
     - Kaboompics: https://kaboompics.com
     - FreeImages: https://www.freeimages.com
     - Reshot: https://www.reshot.com
   - Choose images that are contextually relevant to the mini-program's purpose and content.
   - Ensure a variety of image sizes and orientations to test layout responsiveness.
   - When using images, include appropriate alt text for accessibility.

4. Dynamic Data Generation:
   - For date-based data, use relative dates (e.g., "2 days ago", "next week") or generate dates relative to the current date.
   - For user-generated content, create a set of fictional user profiles with consistent usernames, avatar URLs, and posting patterns.

5. Localization of Sample Data:
   - If the mini-program supports multiple languages, provide sample data in all supported languages.
   - Ensure that date formats, currency symbols, and other locale-specific data are consistent with the chosen locale.

6. Data Consistency:
   - Maintain consistency in the sample data across different pages and components of the mini-program.
   - Ensure that related data (e.g., user IDs, product categories) are used consistently throughout the application.

7. API Emulation:
   - If the mini-program is designed to interact with external APIs, create mock API responses with realistic data structures.
   - Include examples of both successful and error responses in the mock data.

## Validation Steps

Before finalizing the output:
1. Ensure all string values (especially wxml, wxss, and js content) are formatted as single-line strings with "\\n" for line breaks.
2. Verify that there are no actual line breaks within any string value in the JSON structure.
3. Confirm that all quotation marks and other special characters within string values are properly escaped.
4. Attempt to parse the entire output as JSON to catch any formatting errors.
5. Correct any issues found during validation before providing the final output.

## Final Note

Generate only the JSON output based on the given specification. Ensure that all generated code includes the emulated data sets and 
real image URLs as described in the Data and Image Resources section. The mini-program should be fully functional with this sample data 
upon generation. Do not include any explanations or additional text outside the JSON structure.

`
);

class Deserializer implements Tool {
  name: string;
  description: string;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  async execute(inputJson: string, outputDir: string): Promise<void> {
    if (fs.existsSync(outputDir)) {
      fs.rmdirSync(outputDir, { recursive: true });
    }

    // Call the function to generate the mini-program
    FrontendDevSchemaBuilder.validateJson(inputJson);
    generateMiniProgram(inputJson, outputDir);
  }
}

frontendDevAgent.registerTool("CREATE_MINIPROGRAM", new Deserializer("Deserializer", "Construct a Mini-program project out of a JSON structure"));

export { frontendDevAgent };
