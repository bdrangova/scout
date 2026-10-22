import { screen } from "@testing-library/react";

/** The session rail of `renderRunPage`, for `within(...)`. */
export const rail = () =>
  screen.getByRole("complementary", { name: "Session panel" });
