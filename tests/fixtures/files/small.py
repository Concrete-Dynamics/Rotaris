class Calculator:
    def __init__(self):
        self.history = []

    def add(self, a: int, b: int) -> int:
        result = a + b
        self.history.append(result)
        return result

    def subtract(self, a: int, b: int) -> int:
        result = a - b
        self.history.append(result)
        return result

    def multiply(self, a: int, b: int) -> int:
        result = a * b
        self.history.append(result)
        return result

    def divide(self, a: int, b: int) -> float:
        if b == 0:
            raise ZeroDivisionError("Cannot divide by zero")
        result = a / b
        self.history.append(result)
        return result

    def get_history(self) -> list:
        return list(self.history)

    def clear_history(self) -> None:
        self.history.clear()


def main():
    calc = Calculator()
    print(calc.add(2, 3))
    print(calc.subtract(10, 4))
    print(calc.multiply(5, 6))
    print(calc.divide(15, 3))
    print(calc.get_history())
    calc.clear_history()
    print(calc.get_history())


if __name__ == "__main__":
    main()
