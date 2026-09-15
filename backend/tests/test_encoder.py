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
