import { render } from "@testing-library/react-native";
import BrandTitle from "../../src/components/BrandTitle";
import { ThemeProvider } from "../../src/ThemeContext";
import { BRAND } from "../../src/theme";

describe("BrandTitle", () => {
  it("shows the site name and the beta badge", async () => {
    const { getByText } = await render(
      <ThemeProvider>
        <BrandTitle />
      </ThemeProvider>,
    );
    expect(getByText(BRAND.name)).toBeTruthy();
    expect(getByText(BRAND.betaLabel)).toBeTruthy();
  });
});
