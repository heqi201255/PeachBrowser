const { escapeHtml } = require('../../utils/format');

class Rating extends Component {
  constructor(props) {
    super(props);
    this.state = {
      rating: props.rating || 0
    };
  }

  render() {
    const { rating } = this.state;
    const stars = [1, 2, 3, 4, 5].map(star => `
      <span class="rating-star ${star <= rating ? 'active' : ''}" data-rating="${star}">★</span>
    `).join('');

    return `<div class="rating-input">${stars}</div>`;
  }

  bindEvents() {
    this.$$('.rating-star').forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.rating, 10);
        this.setState({ rating });
        if (this.props.onChange) {
          this.props.onChange(rating);
        }
      });
    });
  }

  setRating(rating) {
    this.setState({ rating });
  }
}

module.exports = Rating;