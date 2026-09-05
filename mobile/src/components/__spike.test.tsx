import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { Press } from "@/components/ui/Press";

it("disabled press via responder chain", async () => {
  const onPress = jest.fn();
  await render(
    <Press disabled onPress={onPress} accessibilityLabel="cta">
      <Text>Go</Text>
    </Press>,
  );
  const el = screen.getByLabelText("cta");
  const ev = {
    nativeEvent: { touches: [], changedTouches: [], identifier: 1, locationX: 0, locationY: 0, pageX: 0, pageY: 0, timestamp: Date.now(), target: 1 },
    currentTarget: {},
    target: {},
    persist: () => {},
    dispatchConfig: {},
  };
  fireEvent(el, "responderGrant", ev);
  fireEvent(el, "responderRelease", ev);
  console.log("grant/release called?", onPress.mock.calls.length);
  fireEvent(el, "click", ev);
  console.log("after click called?", onPress.mock.calls.length);
});
