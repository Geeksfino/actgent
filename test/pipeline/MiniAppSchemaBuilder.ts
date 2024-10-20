import { DefaultSchemaBuilder } from "@finogeeks/actgent";
import { z } from "zod";

const frontendDevTemplate = {
  generatedCode: {
    name: "<MINIPROGRAM_NAME>",
    description: "<MINIPROGRAM_DESCRIPTION>",
    category: "<MINIPROGRAM_CATEGORY>",
    appJs: "<GLOBAL_INITIALIZATION_CODE>",
    appWxss: "<GLOBAL_STYLE_SHEET>",
    appJson: {
      pages: ["<LIST_OF_PAGE_PATHS>"],
      window: {
        backgroundTextStyle: "light",
        navigationBarBackgroundColor: "<HEX_COLOR>",
        navigationBarTitleText: "<TITLE>",
        navigationBarTextStyle: "<BLACK_OR_WHITE>",
      },
      // "<OPTIONAL_TABBAR_CONFIG_HERE>"
    },
    projectJson: {
      description: "<PROJECT_DESCRIPTION>",
      packOptions: {
        ignore: [],
      },
      setting: {
        es6: true,
        useOldBuilder: false,
      },
      compileType: "miniprogram",
      appid: "",
      projectname: "<project-name>",
      isGameTourist: false,
      projectType: 0,
      buildOption: {
        compilerSource: "wx",
      },
    },
    sitemapJson: {
      rules: [],
    },
    pages: [
      {
        name: "<PAGE_NAME>",
        wxml: "<WXML_CODE>",
        wxss: "<WXSS_CODE>",
        js: "<JAVASCRIPT_CODE>",
        json: {
          navigationBarTitleText: "<PAGE_TITLE>",
        },
      },
    ],
    images: [
      {
        path: "<IMAGE_URL>",
        content: "<BASE64_OR_FILE_DATA>",
      },
    ],
  },
};


class MiniAppSchemaBuilder extends DefaultSchemaBuilder {
  constructor() {
    super();
  }

  private schema(): z.ZodObject<any> {
    const validPageNameRegex = /^[a-zA-Z0-9_-]+$/;

    // Schema for a single page
    const pageSchema = z.object({
      name: z.string().regex(validPageNameRegex, {
        message:
          "Page name must not contain spaces, tabs, or special characters.",
      }),
      wxml: z.string(), // Assume string for WXML code
      wxss: z.string(), // Assume string for WXSS code
      js: z.string(), // Assume string for JS code
      json: z.object({
        navigationBarTitleText: z.string(), // The title text in the page's json
      }),
    });

    // Schema for images
    const imageSchema = z.object({
      path: z.string().url(), // Must be a valid URL
      content: z.string(), // Could be base64 or file data
    });

    // Schema for tabBar when there are two or more tabs
    const tabBarSchema = z.object({
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color."),
      selectedColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color."),
      backgroundColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color."),
      borderStyle: z.enum(["black", "white"]), // Must be either black or white
      list: z
        .array(
          z.object({
            pagePath: z.string(), // The path to the page
            text: z.string(), // Tab text
          })
        )
        .min(2, "There must be at least two tabs."), // Only valid when there are two or more tabs
    });

    // The main schema for the generated code structure
    const generatedCodeSchema = z.object({
      name: z.string(), // Name of the mini-program
      description: z.string(), // Description of the mini-program
      category: z.string(), // Category of the mini-program
      appJs: z.string(), // Global initialization code (JS)
      appWxss: z.string(), // Global style sheet (WXSS)
      appJson: z.object({
        pages: z.array(z.string()), // List of page paths
        window: z.object({
          backgroundTextStyle: z.string(), // z.enum(["light", "dark"]),
          navigationBarBackgroundColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color."),
          navigationBarTitleText: z.string(),
          navigationBarTextStyle: z.string(),
        }),
        tabBar: z.optional(tabBarSchema), // Optional, only valid if two or more tabs
      }),
      projectJson: z.object({
        description: z.string(),
        packOptions: z.object({
          ignore: z.array(z.string()),
        }),
        setting: z.object({
          es6: z.boolean(),
          useOldBuilder: z.boolean(),
        }),
        compileType: z.enum(["miniprogram"]),
        appid: z.string().optional(),
        projectname: z.string(),
        isGameTourist: z.boolean(),
        projectType: z.number(),
        buildOption: z.object({
          compilerSource: z.enum(["wx"]),
        }),
      }),
      sitemapJson: z.object({
        rules: z.array(z.any()), // Rules array, could be any structure
      }),
      pages: z.array(pageSchema), // Array of pages following the defined schema
      images: z.array(imageSchema), // Array of images
    });

    return generatedCodeSchema;
  }

  public validateJson(jsonString: string): any {
    try {
        const output = JSON.parse(jsonString);
        const generated = this.schema().parse(output);
        return generated;
    } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Validation failed:", e.errors);
        } else {
          console.error("Unexpected error:", e);
        }
      }
  }
}

const FrontendDevSchemaBuilder = new MiniAppSchemaBuilder();

FrontendDevSchemaBuilder.setFormattedOutputForCompletedTask(`
  ${JSON.stringify(frontendDevTemplate)}
`);

export { FrontendDevSchemaBuilder };
