"""Unit tests for crisis logistics pipeline logic."""
import pytest


class TestGeohash:
    def _geohash(self, lat, lng, precision=12):
        if lat is None or lng is None:
            return None
        BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
        lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
        bits = [16, 8, 4, 2, 1]
        geohash = []
        even = True
        bit = 0
        ch = 0
        while len(geohash) < precision:
            if even:
                mid = (lng_range[0] + lng_range[1]) / 2
                if lng > mid:
                    ch |= bits[bit]
                    lng_range[0] = mid
                else:
                    lng_range[1] = mid
            else:
                mid = (lat_range[0] + lat_range[1]) / 2
                if lat > mid:
                    ch |= bits[bit]
                    lat_range[0] = mid
                else:
                    lat_range[1] = mid
            even = not even
            if bit < 4:
                bit += 1
            else:
                geohash.append(BASE32[ch])
                bit = 0
                ch = 0
        return "".join(geohash)

    def test_london_geohash(self):
        result = self._geohash(51.5074, -0.1278, precision=4)
        assert result == "gcpu"

    def test_none_inputs(self):
        assert self._geohash(None, -0.1278) is None
        assert self._geohash(None, None) is None

    def test_precision(self):
        for p in [1, 4, 6, 8, 12]:
            assert len(self._geohash(51.5074, -0.1278, precision=p)) == p


class TestBoundingBox:
    BOUNDS = {"lat_min": 51.38, "lat_max": 51.63, "lng_min": -0.51, "lng_max": -0.17}

    def _in_bounds(self, lat, lng):
        return self.BOUNDS["lat_min"] <= lat <= self.BOUNDS["lat_max"] and self.BOUNDS["lng_min"] <= lng <= self.BOUNDS["lng_max"]

    def test_heathrow_in_bounds(self):
        assert self._in_bounds(51.47, -0.45)

    def test_slough_out_of_bounds(self):
        assert not self._in_bounds(51.51, -0.59)

    def test_ealing_in_bounds(self):
        assert self._in_bounds(51.51, -0.30)


class TestHelicopterDetection:
    HELICOPTER_CODES = {"EC35", "H135", "H145", "A109", "B206", "R44", "S76"}

    def _classify(self, icao):
        return "HELICOPTER" if icao in self.HELICOPTER_CODES else "AIRCRAFT"

    def test_helicopter(self):
        assert self._classify("R44") == "HELICOPTER"

    def test_aircraft(self):
        assert self._classify("B738") == "AIRCRAFT"


class TestAnomalyDetection:
    def _classify(self, z):
        if z > 2.0:
            return "SPIKE"
        elif z < -2.0:
            return "DROP"
        return "NORMAL"

    def test_spike(self):
        assert self._classify(2.5) == "SPIKE"

    def test_drop(self):
        assert self._classify(-2.5) == "DROP"

    def test_normal(self):
        assert self._classify(0.0) == "NORMAL"
        assert self._classify(1.9) == "NORMAL"


class TestSeverityScoring:
    WEIGHTS = {"Severe": 4, "Serious": 3, "Moderate": 2, "Minimal": 1}

    def test_ordering(self):
        w = [self.WEIGHTS[s] for s in ["Minimal", "Moderate", "Serious", "Severe"]]
        assert w == sorted(w)
