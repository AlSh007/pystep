import json
import types

from tracer.encoder import ValueEncoder


def test_primitives_pass_through_unchanged():
    enc = ValueEncoder()
    assert enc.encode(None) is None
    assert enc.encode(True) is True
    assert enc.encode(False) is False
    assert enc.encode(42) == 42
    assert enc.encode(3.14) == 3.14
    assert enc.encode("hi") == "hi"


def test_list_is_tagged_with_id_and_elements():
    enc = ValueEncoder()
    result = enc.encode([1, 2, 3])
    assert result[0] == "LIST"
    assert isinstance(result[1], int)
    assert result[2:] == [1, 2, 3]


def test_tuple_encoding():
    enc = ValueEncoder()
    result = enc.encode((1, 2))
    assert result[0] == "TUPLE"
    assert result[2:] == [1, 2]


def test_set_encoding():
    enc = ValueEncoder()
    result = enc.encode({1, 2})
    assert result[0] == "SET"
    assert sorted(result[2:]) == [1, 2]


def test_dict_encoding():
    enc = ValueEncoder()
    result = enc.encode({"a": 1, "b": 2})
    assert result[0] == "DICT"
    assert result[2:] == [["a", 1], ["b", 2]]


def test_shared_reference_keeps_same_id():
    enc = ValueEncoder()
    shared = [1]
    container = enc.encode([shared, shared])
    first_ref_id = container[2][1]
    second_ref_id = container[3][1]
    assert first_ref_id == second_ref_id


def test_circular_reference_is_marked():
    enc = ValueEncoder()
    cyclic = []
    cyclic.append(cyclic)
    result = enc.encode(cyclic)
    assert result[2] == ["CIRCULAR_REF", result[1]]


def test_function_encoding():
    enc = ValueEncoder()

    def add(a, b):
        return a + b

    result = enc.encode(add)
    assert result[0] == "FUNCTION"
    assert result[1] == "add"
    assert isinstance(result[2], int)


def test_instance_encoding():
    class Point:
        def __init__(self, x, y):
            self.x = x
            self.y = y

    enc = ValueEncoder()
    result = enc.encode(Point(1, 2))
    assert result[0] == "INSTANCE"
    assert result[1] == "Point"
    assert isinstance(result[2], int)
    attrs = dict(result[3:])
    assert attrs == {"x": 1, "y": 2}


def test_module_is_encoded_as_a_short_string_not_expanded():
    enc = ValueEncoder()
    result = enc.encode(json)
    assert isinstance(result, str)
    assert result.startswith("<module")
    # Sanity check it isn't secretly a giant compound array in string form.
    assert len(result) < 100


def test_module_encoding_is_json_serializable_and_short():
    enc = ValueEncoder()
    result = enc.encode(types)
    encoded_json = json.dumps(result)
    assert len(encoded_json) < 100


def test_positive_infinity_encodes_as_inf_string():
    enc = ValueEncoder()
    result = enc.encode(float("inf"))
    assert result == "inf"


def test_negative_infinity_encodes_as_negative_inf_string():
    enc = ValueEncoder()
    result = enc.encode(float("-inf"))
    assert result == "-inf"


def test_nan_encodes_as_nan_string():
    enc = ValueEncoder()
    result = enc.encode(float("nan"))
    assert result == "nan"


def test_finite_float_still_passes_through_unchanged():
    enc = ValueEncoder()
    result = enc.encode(3.14)
    assert result == 3.14
    assert isinstance(result, float)


def test_non_finite_float_results_are_valid_json_strings():
    enc = ValueEncoder()
    for value, expected in (
        (float("inf"), "inf"),
        (float("-inf"), "-inf"),
        (float("nan"), "nan"),
    ):
        result = enc.encode(value)
        dumped = json.dumps(result)
        assert dumped == f'"{expected}"'
        # json.loads should hand back the plain string, not attempt to
        # reconstruct a non-finite float from bare Infinity/NaN tokens.
        assert json.loads(dumped) == expected
