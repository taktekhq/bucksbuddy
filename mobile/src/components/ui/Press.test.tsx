// Press has no counterpart on the web — there it is a `.press` class on a
// plain <button>. Here it is a Pressable wrapper, so what there is to test is
// the Pressable contract it has to keep: children, presses, pass-through props,
// and the forwarded ref.
import { createRef } from "react";
import { Text, View } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Press } from "@/components/ui/Press";

describe("Press", () => {
  it("renders its children", async () => {
    await render(
      <Press>
        <Text>Tap me</Text>
      </Press>,
    );
    expect(screen.getByText("Tap me")).toBeOnTheScreen();
  });

  it("reports presses", async () => {
    const onPress = jest.fn();
    await render(
      <Press onPress={onPress} accessibilityLabel="Save">
        <Text>Save</Text>
      </Press>,
    );
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("swallows presses while disabled", async () => {
    const onPress = jest.fn();
    await render(
      <Press onPress={onPress} disabled accessibilityLabel="Save">
        <Text>Save</Text>
      </Press>,
    );
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("passes Pressable props straight through", async () => {
    await render(
      <Press accessibilityLabel="Back" hitSlop={8} testID="back">
        <Text>Back</Text>
      </Press>,
    );
    const el = screen.getByTestId("back");
    expect(el.props.hitSlop).toBe(8);
    expect(el.props.accessibilityState).toEqual({});
  });

  it("forwards its ref to the underlying view", async () => {
    const ref = createRef<View>();
    await render(
      <Press ref={ref} accessibilityLabel="Row">
        <Text>Row</Text>
      </Press>,
    );
    expect(ref.current).not.toBeNull();
  });

  it("still renders and presses with noScale (the web's plain button)", async () => {
    const onPress = jest.fn();
    await render(
      <Press noScale onPress={onPress} accessibilityLabel="Plain" className="p-2">
        <Text>Plain</Text>
      </Press>,
    );
    fireEvent.press(screen.getByLabelText("Plain"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Plain")).toBeOnTheScreen();
  });

  it("renders with no children at all", async () => {
    await render(<Press accessibilityLabel="Empty" testID="empty" />);
    expect(screen.getByTestId("empty")).toBeOnTheScreen();
  });
});
