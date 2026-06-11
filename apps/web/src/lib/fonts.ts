export type FontGroup = "Sans-serif" | "Serif" | "Special";

export interface FontOption {
  value: string;
  label: string;
  group: FontGroup;
}

export const FONTS: FontOption[] = [
  { value: "Inter",          label: "Inter",                        group: "Sans-serif" },
  { value: "Roboto",         label: "Roboto",                       group: "Sans-serif" },
  { value: "Open Sans",      label: "Open Sans",                    group: "Sans-serif" },
  { value: "Lato",           label: "Lato",                         group: "Sans-serif" },
  { value: "Montserrat",     label: "Montserrat",                   group: "Sans-serif" },
  { value: "Source Sans 3",  label: "Source Sans 3",                group: "Sans-serif" },
  { value: "Nunito",         label: "Nunito",                       group: "Sans-serif" },
  { value: "Merriweather",   label: "Merriweather",                 group: "Serif"      },
  { value: "Playfair Display", label: "Playfair Display",           group: "Serif"      },
  { value: "Lora",           label: "Lora",                         group: "Serif"      },
  { value: "EB Garamond",    label: "EB Garamond",                  group: "Serif"      },
  { value: "Libre Baskerville", label: "Libre Baskerville",         group: "Serif"      },
  { value: "Carlito",        label: "Carlito (Calibri-compatible)", group: "Special"    },
];
