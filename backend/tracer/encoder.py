PRIMITIVE_TYPES = (type(None), bool, int, float, str)


class ValueEncoder:
    """Encodes Python runtime values into JSON-safe structures.

    Compound values get a small integer id, stable for the life of this
    ValueEncoder instance, so the frontend can detect aliasing and
    shared references between variables (mirrors pg_encoder.py's scheme).
    """

    def __init__(self):
        self._real_to_small_id: dict[int, int] = {}
        self._next_small_id = 1

    def _small_id(self, obj) -> int:
        real_id = id(obj)
        if real_id not in self._real_to_small_id:
            self._real_to_small_id[real_id] = self._next_small_id
            self._next_small_id += 1
        return self._real_to_small_id[real_id]

    def encode(self, value, path_ids=None):
        if path_ids is None:
            path_ids = set()

        if isinstance(value, PRIMITIVE_TYPES):
            return value

        real_id = id(value)
        if real_id in path_ids:
            return ["CIRCULAR_REF", self._small_id(value)]

        next_path = path_ids | {real_id}

        if isinstance(value, list):
            return ["LIST", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, tuple):
            return ["TUPLE", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, set):
            return ["SET", self._small_id(value)] + [
                self.encode(v, next_path) for v in value
            ]
        if isinstance(value, dict):
            return ["DICT", self._small_id(value)] + [
                [self.encode(k, next_path), self.encode(v, next_path)]
                for k, v in value.items()
            ]

        if callable(value) and hasattr(value, "__name__"):
            return ["FUNCTION", value.__name__, self._small_id(value)]

        if hasattr(value, "__dict__"):
            class_name = type(value).__name__
            attrs = [
                [k, self.encode(v, next_path)] for k, v in vars(value).items()
            ]
            return ["INSTANCE", class_name, self._small_id(value)] + attrs

        return [type(value).__name__.upper(), self._small_id(value), repr(value)]
