export type Collection = { id: string; name: string; description: string; color: string };
export type Product = {
  id: string;
  name: string;
  collectionId: string;
  description: string;
  price: number;
  color: string;
  kit: 'home' | 'gk';
  player: string;
  number: string;
  sizes: string[];
  stock: number;
  featured: boolean;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
};
export type CartItem = { productId: string; size: string; quantity: number };
export type OrderItem = CartItem & { name: string; price: number };
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
export type Order = {
  id: string;
  createdAt: string;
  status: OrderStatus;
  customer: {
    name: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
    phone: string;
  };
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: 'cash-on-delivery';
};
export type Contact = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};
