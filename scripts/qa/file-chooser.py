"""Exercise an actual GTK save/overwrite dialog on the probe's isolated X11 bus."""
import json
import sys
import time
from pathlib import Path
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

destination = Path(sys.argv[1]).resolve()
assert destination.parent.name == "qa-files"
assert destination.parent.parent.name.startswith("profile-")
assert sys.argv[2] in ("cancel", "replace")
deadline = time.monotonic() + 15


def walk(node, depth=0):
    if depth > 36:
        return
    try:
        yield node
        for index in range(node.get_child_count()):
            child = node.get_child_at_index(index)
            if child:
                yield from walk(child, depth + 1)
    except Exception:
        return


def button(nodes, names):
    for node in nodes:
        try:
            if node.get_role() == Atspi.Role.PUSH_BUTTON and node.get_name().strip().casefold() in names and node.get_state_set().contains(Atspi.StateType.SHOWING) and node.get_state_set().contains(Atspi.StateType.SENSITIVE):
                return node
        except Exception:
            pass
    return None


def click(node):
    assert node.get_action_iface().do_action(0)


saved = False
confirmations = 0
last_replace = None
last = []
while time.monotonic() < deadline:
    nodes = list(walk(Atspi.get_desktop(0)))
    last = [(node.get_role_name(), node.get_name()) for node in nodes]
    alerts = [node for node in nodes if node.get_role() in (Atspi.Role.ALERT, Atspi.Role.DIALOG) and node.get_state_set().contains(Atspi.StateType.SHOWING)]
    replace = next((found for alert in reversed(alerts) if (found := button(list(walk(alert)), {"replace", "sostituisci", "_replace", "_sostituisci"}))), None)
    if saved and confirmations and not replace and not any(node.get_role() == Atspi.Role.FRAME and node.get_name().startswith("https://linux.rokko.test:") for node in nodes):
        print(json.dumps({"overwrite": sys.argv[2], "confirmations": confirmations}))
        sys.exit(0)
    if saved and replace:
        if replace == last_replace:
            time.sleep(0.15)
            continue
        last_replace = replace
        chosen = replace if sys.argv[2] == "replace" else button(nodes, {"cancel", "annulla", "_cancel", "_annulla", "close", "chiudi"})
        assert chosen, str([(node.get_role_name(), node.get_name()) for node in nodes if node.get_n_actions()])
        click(chosen)
        confirmations += 1
        if confirmations > 4:
            raise RuntimeError("Repeated overwrite confirmation did not finish")
        time.sleep(0.25)
        remaining = list(walk(Atspi.get_desktop(0)))
        if not button(remaining, {"replace", "sostituisci", "_replace", "_sostituisci"}) and not any(node.get_role() == Atspi.Role.FRAME and node.get_name().startswith("https://linux.rokko.test:") for node in remaining):
            print(json.dumps({"overwrite": sys.argv[2], "confirmations": confirmations}))
            sys.exit(0)
        continue
    if not saved:
        dialogs = [node for node in nodes if node.get_role() == Atspi.Role.FILE_CHOOSER or (node.get_role() == Atspi.Role.FRAME and node.get_name().startswith("https://linux.rokko.test:"))]
        for dialog in dialogs:
            children = list(walk(dialog))
            save = button(children, {"save", "salva", "_save", "_salva"})
            if not save:
                continue
            if sys.argv[2] == "cancel":
                cancel = button(children, {"cancel", "annulla", "_cancel", "_annulla", "close", "chiudi"})
                if not cancel:
                    raise RuntimeError("Save dialog cancel action missing: " + str([(node.get_role_name(), node.get_name()) for node in children if node.get_n_actions()]))
                click(cancel)
                print(json.dumps({"cancel": "save-dialog"}))
                sys.exit(0)
            entries = [node for node in children if node.is_editable_text() and "search" not in node.get_name().casefold() and "cerca" not in node.get_name().casefold()]
            if not entries:
                continue
            entry = next((node for node in entries if "name" in node.get_name().casefold() or "nome" in node.get_name().casefold()), entries[0])
            assert entry.get_editable_text_iface().set_text_contents(destination.name)
            time.sleep(0.2)
            click(save)
            saved = True
            break
    time.sleep(0.15)

raise RuntimeError("Native save/overwrite dialog did not become ready: " + json.dumps(last))
